import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installPluginFromRegistryAction } from '../actions/installPluginFromRegistry';
import { PluginManagerService } from '../services/pluginManagerService';
import type { IAgentRuntime, Memory, ServiceTypeName } from '@elizaos/core';

vi.mock('../services/pluginManagerService');

describe('installPluginFromRegistry', () => {
  let mockRuntime: IAgentRuntime;
  let mockPluginManager: PluginManagerService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPluginManager = {
      installPluginFromRegistry: vi.fn(),
    } as any;

    mockRuntime = {
      getService: vi.fn().mockReturnValue(mockPluginManager),
      getSetting: vi.fn(),
      services: {
        get: vi.fn().mockReturnValue(mockPluginManager),
      },
    } as any;
  });

  describe('metadata', () => {
    it('should have correct action metadata', () => {
      expect(installPluginFromRegistryAction.name).toBe('installPluginFromRegistry');
      expect(installPluginFromRegistryAction.similes).toContain('install plugin from registry');
      expect(installPluginFromRegistryAction.description).toBe(
        'Install a plugin from the ElizaOS plugin registry'
      );
      expect(installPluginFromRegistryAction.validate).toBeDefined();
      expect(installPluginFromRegistryAction.handler).toBeDefined();
    });

    it('should have similes defined', () => {
      expect(installPluginFromRegistryAction.similes).toBeDefined();
      expect(Array.isArray(installPluginFromRegistryAction.similes)).toBe(true);
      expect(installPluginFromRegistryAction.similes).toContain('install plugin from registry');
      expect(installPluginFromRegistryAction.similes).toContain('add plugin from registry');
    });
  });

  describe('validate', () => {
    it('should validate when plugin manager service is available', async () => {
      const result = await installPluginFromRegistryAction.validate(mockRuntime, {} as any);
      expect(result).toBe(true);
    });

    it('should not validate when plugin manager service is not available', async () => {
      mockRuntime.getService = vi.fn().mockReturnValue(null);
      const result = await installPluginFromRegistryAction.validate(mockRuntime, {} as any);
      expect(result).toBe(false);
    });
  });

  describe('handler', () => {
    const message: Memory = {
      id: '12345678-1234-1234-1234-123456789012',
      entityId: '12345678-1234-1234-1234-123456789015',
      agentId: '12345678-1234-1234-1234-123456789013',
      roomId: '12345678-1234-1234-1234-123456789014',
      content: { text: 'install plugin from registry @elizaos/plugin-example' },
    };

    it('should extract plugin name from message and install', async () => {
      mockPluginManager.installPluginFromRegistry = vi.fn().mockResolvedValue({
        name: '@elizaos/plugin-example',
        version: '1.0.0',
        status: 'installed',
      });

      const result = await installPluginFromRegistryAction.handler(mockRuntime, message);

      expect(mockPluginManager.installPluginFromRegistry).toHaveBeenCalledWith(
        '@elizaos/plugin-example'
      );
      expect(result).toContain('Successfully installed plugin @elizaos/plugin-example v1.0.0');
    });

    it('should handle plugin names without @ prefix', async () => {
      const testMessage = {
        ...message,
        content: { text: 'install plugin-example from registry' },
      };

      mockPluginManager.installPluginFromRegistry = vi.fn().mockResolvedValue({
        name: 'plugin-example',
        version: '1.0.0',
        status: 'installed',
      });

      const result = await installPluginFromRegistryAction.handler(mockRuntime, testMessage);

      expect(mockPluginManager.installPluginFromRegistry).toHaveBeenCalledWith('plugin-example');
      expect(result).toContain('Successfully installed plugin plugin-example v1.0.0');
    });

    it('should handle plugin names with version', async () => {
      const testMessage = {
        ...message,
        content: { text: 'install @elizaos/plugin-example@1.2.3 from registry' },
      };

      mockPluginManager.installPluginFromRegistry = vi.fn().mockResolvedValue({
        name: '@elizaos/plugin-example',
        version: '1.2.3',
        status: 'installed',
      });

      const result = await installPluginFromRegistryAction.handler(mockRuntime, testMessage);

      expect(mockPluginManager.installPluginFromRegistry).toHaveBeenCalledWith(
        '@elizaos/plugin-example@1.2.3'
      );
      expect(result).toContain('Successfully installed plugin @elizaos/plugin-example v1.2.3');
    });

    it('should handle plugins that need configuration', async () => {
      mockPluginManager.installPluginFromRegistry = vi.fn().mockResolvedValue({
        name: '@elizaos/plugin-example',
        version: '1.0.0',
        status: 'needs_configuration',
        requiredEnvVars: [
          { name: 'API_KEY', description: 'API Key for service', sensitive: true },
          { name: 'API_URL', description: 'API endpoint URL', sensitive: false },
        ],
      });

      const result = await installPluginFromRegistryAction.handler(mockRuntime, message);

      expect(result).toContain(
        'Plugin @elizaos/plugin-example has been installed but requires configuration'
      );
      expect(result).toContain('API_KEY: API Key for service (sensitive)');
      expect(result).toContain('API_URL: API endpoint URL');
      expect(result).toContain(
        'Use "configure plugin" to set up the required environment variables'
      );
    });

    it('should handle installation errors', async () => {
      mockPluginManager.installPluginFromRegistry = vi
        .fn()
        .mockRejectedValue(new Error('Failed to install plugin'));

      const result = await installPluginFromRegistryAction.handler(mockRuntime, message);

      expect(result).toBe('Failed to install plugin: Failed to install plugin');
    });

    it('should handle missing plugin manager service', async () => {
      mockRuntime.getService = vi.fn().mockReturnValue(null);

      const result = await installPluginFromRegistryAction.handler(mockRuntime, message);

      expect(result).toBe('Plugin manager service not available');
    });

    it('should handle missing plugin name', async () => {
      const testMessage = {
        ...message,
        content: { text: 'install from registry' },
      };

      const result = await installPluginFromRegistryAction.handler(mockRuntime, testMessage);

      expect(result).toContain('Please specify a plugin name to install');
    });

    it('should handle various command formats', async () => {
      const commandFormats = [
        { text: 'add plugin @elizaos/test from registry', expected: '@elizaos/test' },
        { text: 'download plugin some-plugin', expected: 'some-plugin' },
        { text: 'get plugin test-pkg', expected: 'test-pkg' },
      ];

      mockPluginManager.installPluginFromRegistry = vi.fn().mockResolvedValue({
        name: 'test',
        version: '1.0.0',
        status: 'installed',
      });

      for (const format of commandFormats) {
        const testMessage = {
          ...message,
          content: { text: format.text },
        };

        await installPluginFromRegistryAction.handler(mockRuntime, testMessage);

        expect(mockPluginManager.installPluginFromRegistry).toHaveBeenCalledWith(format.expected);
      }
    });
  });
});
