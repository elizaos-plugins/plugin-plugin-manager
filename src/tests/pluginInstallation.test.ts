import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManagerService } from '../services/pluginManagerService';
import { type IAgentRuntime, type Plugin, type UUID } from '@elizaos/core';
import { PluginStatus } from '../types';
import fs from 'fs-extra';
import path from 'path';
import { resetRegistryCache } from '../services/pluginManagerService';

// Mock fs-extra
vi.mock('fs-extra');

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('Plugin Installation', () => {
  let mockRuntime: IAgentRuntime;
  let pluginManager: PluginManagerService;
  const mockExeca = vi.fn();

  beforeEach(async () => {
    // Reset registry cache before each test
    resetRegistryCache();

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
    vi.mocked(fs.readJson).mockResolvedValue({
      name: '@elizaos/test-plugin',
      version: '1.0.0',
      main: 'dist/index.js',
      elizaos: {
        requiredEnvVars: [
          {
            name: 'TEST_API_KEY',
            description: 'Test API key',
            sensitive: true,
          },
        ],
      },
    });
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.copy).mockResolvedValue(undefined);
    vi.mocked(fs.remove).mockResolvedValue(undefined);

    // Mock execa
    const execaMock = await import('execa');
    (execaMock.execa as any) = mockExeca;
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' });

    // Mock fetch for registry
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '@elizaos/plugin-npm-example': {
          name: '@elizaos/plugin-npm-example',
          description: 'Example npm plugin',
          repository: 'https://github.com/elizaos/plugin-npm-example',
          npm: {
            repo: '@elizaos/plugin-npm-example',
            v1: '1.0.0',
          },
        },
        '@elizaos/plugin-git-example': {
          name: '@elizaos/plugin-git-example',
          description: 'Example git plugin',
          repository: 'https://github.com/elizaos/plugin-git-example',
          git: {
            repo: 'https://github.com/elizaos/plugin-git-example.git',
            v1: {
              branch: 'main',
              version: 'v1.0.0',
            },
          },
        },
      }),
    });

    pluginManager = new PluginManagerService(mockRuntime, {
      pluginDirectory: './test-plugins',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('NPM Installation', () => {
    it('should install plugin from npm successfully', async () => {
      const pluginInfo = await pluginManager.installPluginFromRegistry(
        '@elizaos/plugin-npm-example'
      );

      expect(pluginInfo).toBeDefined();
      expect(pluginInfo.name).toBe('@elizaos/test-plugin');
      expect(pluginInfo.version).toBe('1.0.0');
      expect(pluginInfo.status).toBe('needs_configuration');
      expect(pluginInfo.requiredEnvVars).toHaveLength(1);

      // Verify npm install was called correctly
      expect(mockExeca).toHaveBeenCalledWith(
        'npm',
        ['install', '@elizaos/plugin-npm-example@1.0.0', '--prefix', expect.any(String)],
        { stdio: 'pipe' }
      );
    });

    it('should install plugin with specific version', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example', '2.0.0');

      expect(mockExeca).toHaveBeenCalledWith(
        'npm',
        ['install', '@elizaos/plugin-npm-example@2.0.0', '--prefix', expect.any(String)],
        { stdio: 'pipe' }
      );
    });

    it('should handle npm installation errors', async () => {
      mockExeca.mockRejectedValueOnce(new Error('npm install failed'));

      await expect(
        pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example')
      ).rejects.toThrow('npm install failed');
    });

    it('should set status to installed when no env vars required', async () => {
      vi.mocked(fs.readJson).mockResolvedValueOnce({
        name: '@elizaos/simple-plugin',
        version: '1.0.0',
        main: 'index.js',
        elizaos: {
          requiredEnvVars: [],
        },
      });

      const pluginInfo = await pluginManager.installPluginFromRegistry(
        '@elizaos/plugin-npm-example'
      );

      expect(pluginInfo.status).toBe('installed');
    });
  });

  describe('Git Installation', () => {
    it('should install plugin from git successfully', async () => {
      const pluginInfo = await pluginManager.installPluginFromRegistry(
        '@elizaos/plugin-git-example'
      );

      expect(pluginInfo).toBeDefined();
      expect(pluginInfo.name).toBe('@elizaos/test-plugin');

      // Verify git clone was called
      expect(mockExeca).toHaveBeenCalledWith(
        'git',
        ['clone', 'https://github.com/elizaos/plugin-git-example.git', expect.any(String)],
        { stdio: 'pipe' }
      );

      // Verify npm install was called in cloned directory
      expect(mockExeca).toHaveBeenCalledWith('npm', ['install'], {
        cwd: expect.any(String),
        stdio: 'pipe',
      });
    });

    it('should checkout specific version for git plugin', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-git-example', 'v2.0.0');

      expect(mockExeca).toHaveBeenCalledWith('git', ['checkout', 'v2.0.0'], {
        cwd: expect.any(String),
        stdio: 'pipe',
      });
    });

    it('should clean up temp directory after git installation', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-git-example');

      expect(fs.remove).toHaveBeenCalled();
    });

    it('should clean up temp directory even on error', async () => {
      mockExeca.mockRejectedValueOnce(new Error('git clone failed'));

      await expect(
        pluginManager.installPluginFromRegistry('@elizaos/plugin-git-example')
      ).rejects.toThrow('git clone failed');

      expect(fs.remove).toHaveBeenCalled();
    });
  });

  describe('Registry Operations', () => {
    it('should fetch available plugins from registry', async () => {
      const plugins = await pluginManager.getAvailablePluginsFromRegistry();

      expect(plugins).toHaveProperty('@elizaos/plugin-npm-example');
      expect(plugins).toHaveProperty('@elizaos/plugin-git-example');
    });

    it('should cache registry data', async () => {
      // First call
      await pluginManager.getAvailablePluginsFromRegistry();

      // Second call should use cache
      await pluginManager.getAvailablePluginsFromRegistry();

      // Fetch should only be called once due to caching
      expect((global as any).fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle registry fetch errors gracefully', async () => {
      (global as any).fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const plugins = await pluginManager.getAvailablePluginsFromRegistry();

      // Should return empty registry on error
      expect(plugins).toEqual({});
    });

    it('should throw error for non-existent plugin', async () => {
      await expect(
        pluginManager.installPluginFromRegistry('@elizaos/non-existent')
      ).rejects.toThrow('Plugin @elizaos/non-existent not found in registry');
    });
  });

  describe('Plugin Loading After Installation', () => {
    it('should load installed plugin successfully', async () => {
      // Mock the plugin module loading
      const mockPlugin = {
        name: '@elizaos/plugin-npm-example',
        description: 'Test plugin',
        actions: [
          {
            name: 'TEST_ACTION',
            description: 'Test action',
            handler: vi.fn(),
          },
        ],
      };

      // Override the loadPluginModule method to return our mock
      vi.spyOn(pluginManager as any, 'loadPluginModule').mockResolvedValueOnce(mockPlugin);

      // First install
      const pluginInfo = await pluginManager.installPluginFromRegistry(
        '@elizaos/plugin-npm-example'
      );

      // Mock no env vars required
      vi.mocked(fs.readJson).mockResolvedValueOnce({
        name: '@elizaos/plugin-npm-example',
        version: '1.0.0',
        main: 'dist/index.js',
        elizaos: { requiredEnvVars: [] },
      });

      // Update plugin info to mark as installed
      pluginInfo.status = 'installed';

      // Then load
      const pluginId = await pluginManager.loadInstalledPlugin('@elizaos/plugin-npm-example');

      expect(pluginId).toBeDefined();
      const pluginState = pluginManager.getPlugin(pluginId);
      expect(pluginState?.status).toBe(PluginStatus.LOADED);
    });

    it('should prevent loading plugin that needs configuration', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example');

      await expect(
        pluginManager.loadInstalledPlugin('@elizaos/plugin-npm-example')
      ).rejects.toThrow();
    });
  });

  describe('Installed Plugin Management', () => {
    it('should track installed plugins', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example');

      const installedPlugins = pluginManager.listInstalledPlugins();
      expect(installedPlugins).toHaveLength(1);
      expect(installedPlugins[0].name).toBe('@elizaos/test-plugin');
    });

    it('should get specific installed plugin info', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example');

      const pluginInfo = pluginManager.getInstalledPluginInfo('@elizaos/plugin-npm-example');
      expect(pluginInfo).toBeDefined();
      expect(pluginInfo?.name).toBe('@elizaos/test-plugin');
    });

    it('should handle plugin path sanitization', async () => {
      await pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example');

      // Verify the path was sanitized (@ replaced with _)
      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('_elizaos_plugin-npm-example')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing package.json', async () => {
      vi.mocked(fs.readJson).mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      await expect(
        pluginManager.installPluginFromRegistry('@elizaos/plugin-npm-example')
      ).rejects.toThrow();
    });

    it('should handle malformed package.json', async () => {
      vi.mocked(fs.readJson).mockResolvedValueOnce({
        // Missing required fields
      });

      const pluginInfo = await pluginManager.installPluginFromRegistry(
        '@elizaos/plugin-npm-example'
      );

      expect(pluginInfo.name).toBe('unknown');
      expect(pluginInfo.version).toBe('0.0.0');
    });

    it('should handle installation with no installation method', async () => {
      (global as any).fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          '@elizaos/broken-plugin': {
            name: '@elizaos/broken-plugin',
            description: 'Broken plugin with no installation method',
            repository: 'https://github.com/elizaos/broken',
            // No npm or git field
          },
        }),
      });

      await expect(
        pluginManager.installPluginFromRegistry('@elizaos/broken-plugin')
      ).rejects.toThrow('No installation method available');
    });
  });
});
