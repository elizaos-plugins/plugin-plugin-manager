import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManagerService } from '../services/pluginManagerService';
import { type IAgentRuntime, type UUID } from '@elizaos/core';
import { PluginStatus } from '../types';
import fs from 'fs-extra';
import path from 'path';

// Mock fs-extra
vi.mock('fs-extra');

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('Local Bundle Installation', () => {
  let mockRuntime: IAgentRuntime;
  let pluginManager: PluginManagerService;
  const mockExeca = vi.fn();

  beforeEach(async () => {
    // Mock runtime
    mockRuntime = {
      agentId: 'test-agent-id' as UUID,
      plugins: [],
      events: new Map(),
      registerPlugin: vi.fn(),
      registerAction: vi.fn(),
      registerProvider: vi.fn(),
      registerEvaluator: vi.fn(),
      registerEvent: vi.fn(),
      emitEvent: vi.fn(),
      actions: [],
      providers: [],
      evaluators: [],
      services: new Map(),
    } as any;

    // Mock fs methods
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as any);
    vi.mocked(fs.readJson).mockResolvedValue({
      name: '@elizaos/local-plugin',
      version: '1.0.0',
      main: 'index.js',
      elizaos: {
        requiredEnvVars: [],
      },
    });
    vi.mocked(fs.copy).mockResolvedValue(undefined);

    // Mock execa
    const execaMock = await import('execa');
    (execaMock.execa as any) = mockExeca;
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

    pluginManager = new PluginManagerService(mockRuntime, {
      pluginDirectory: './test-plugins',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Directory Bundle Installation', () => {
    it('should install plugin from local directory', async () => {
      const bundlePath = '/path/to/local/plugin';

      const pluginInfo = await pluginManager.installFromLocalBundle(bundlePath);

      expect(pluginInfo).toBeDefined();
      expect(pluginInfo.name).toBe('@elizaos/local-plugin');
      expect(pluginInfo.version).toBe('1.0.0');
      expect(pluginInfo.status).toBe('installed');

      // Verify directory was copied
      expect(fs.copy).toHaveBeenCalledWith(
        bundlePath,
        expect.stringContaining('_elizaos_local-plugin')
      );
    });

    it('should install dependencies if node_modules missing', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true as any) // bundle exists
        .mockResolvedValueOnce(false as any); // node_modules doesn't exist

      await pluginManager.installFromLocalBundle('/path/to/plugin');

      expect(mockExeca).toHaveBeenCalledWith('npm', ['install'], {
        cwd: expect.any(String),
        stdio: 'pipe',
      });
    });

    it('should skip npm install if node_modules exists', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as any);

      await pluginManager.installFromLocalBundle('/path/to/plugin');

      expect(mockExeca).not.toHaveBeenCalled();
    });

    it('should handle plugins requiring env vars', async () => {
      vi.mocked(fs.readJson).mockResolvedValueOnce({
        name: '@elizaos/env-plugin',
        version: '1.0.0',
        main: 'index.js',
        elizaos: {
          requiredEnvVars: [
            {
              name: 'API_KEY',
              description: 'API key for service',
              sensitive: true,
            },
          ],
        },
      });

      const pluginInfo = await pluginManager.installFromLocalBundle('/path/to/plugin');

      expect(pluginInfo.status).toBe('needs_configuration');
      expect(pluginInfo.requiredEnvVars).toHaveLength(1);
      expect(pluginInfo.requiredEnvVars[0].name).toBe('API_KEY');
    });

    it('should track progress during installation', async () => {
      const progressUpdates: any[] = [];
      const onProgress = vi.fn((progress) => progressUpdates.push(progress));

      await pluginManager.installFromLocalBundle('/path/to/plugin', onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates).toContainEqual(
        expect.objectContaining({
          phase: 'validating',
          message: expect.stringContaining('Validating bundle'),
        })
      );
      expect(progressUpdates).toContainEqual(
        expect.objectContaining({
          phase: 'complete',
          progress: 100,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it("should throw error if bundle path doesn't exist", async () => {
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false as any);

      await expect(pluginManager.installFromLocalBundle('/non/existent/path')).rejects.toThrow(
        'Bundle path does not exist'
      );
    });

    it('should throw error for compressed bundles (not implemented)', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({
        isDirectory: () => false,
      } as any);

      await expect(pluginManager.installFromLocalBundle('/path/to/plugin.tar.gz')).rejects.toThrow(
        'Compressed bundle installation not yet implemented'
      );
    });

    it('should handle missing package.json', async () => {
      vi.mocked(fs.readJson).mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      await expect(pluginManager.installFromLocalBundle('/path/to/plugin')).rejects.toThrow();
    });

    it('should handle malformed package.json', async () => {
      vi.mocked(fs.readJson).mockResolvedValueOnce({});

      const pluginInfo = await pluginManager.installFromLocalBundle('/path/to/plugin');

      expect(pluginInfo.name).toBe('unknown');
      expect(pluginInfo.version).toBe('0.0.0');
    });

    it('should handle npm install errors', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true as any)
        .mockResolvedValueOnce(false as any); // no node_modules

      mockExeca.mockRejectedValueOnce(new Error('npm install failed'));

      await expect(pluginManager.installFromLocalBundle('/path/to/plugin')).rejects.toThrow(
        'npm install failed'
      );
    });
  });

  describe('Plugin Management', () => {
    it('should track installed local bundles', async () => {
      // Mock different package names for different paths
      vi.mocked(fs.readJson)
        .mockResolvedValueOnce({
          name: '@elizaos/local-plugin-1',
          version: '1.0.0',
          main: 'index.js',
          elizaos: { requiredEnvVars: [] },
        })
        .mockResolvedValueOnce({
          name: '@elizaos/local-plugin-2',
          version: '1.0.0',
          main: 'index.js',
          elizaos: { requiredEnvVars: [] },
        });

      await pluginManager.installFromLocalBundle('/path/to/plugin1');
      await pluginManager.installFromLocalBundle('/path/to/plugin2');

      const installedPlugins = pluginManager.listInstalledPlugins();
      expect(installedPlugins).toHaveLength(2);
    });

    it('should load installed local bundle', async () => {
      // Mock the plugin module
      const mockPlugin = {
        name: '@elizaos/local-plugin',
        description: 'Local test plugin',
        actions: [],
      };

      vi.spyOn(pluginManager as any, 'loadPluginModule').mockResolvedValueOnce(mockPlugin);

      // Install and load
      await pluginManager.installFromLocalBundle('/path/to/plugin');
      const pluginId = await pluginManager.loadInstalledPlugin('@elizaos/local-plugin');

      expect(pluginId).toBeDefined();
      const pluginState = pluginManager.getPlugin(pluginId);
      expect(pluginState?.status).toBe(PluginStatus.LOADED);
    });

    it('should handle duplicate installations', async () => {
      // First installation
      await pluginManager.installFromLocalBundle('/path/to/plugin');

      // Second installation should overwrite
      const pluginInfo2 = await pluginManager.installFromLocalBundle('/path/to/plugin');

      expect(pluginInfo2).toBeDefined();
      const installedPlugins = pluginManager.listInstalledPlugins();
      expect(installedPlugins).toHaveLength(1);
    });
  });
});
