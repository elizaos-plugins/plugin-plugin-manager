import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type IAgentRuntime,
  type Plugin,
  type Action,
  type Provider,
  type Evaluator,
  Service,
  type ServiceTypeName,
} from '@elizaos/core';
import { PluginManagerService } from '../services/pluginManagerService';
import { PluginStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock service for testing
class TestService extends Service {
  static serviceType: ServiceTypeName = 'TEST_SERVICE' as ServiceTypeName;
  override capabilityDescription = 'Test service for component tracking';

  static async start(runtime: IAgentRuntime): Promise<Service> {
    return new TestService(runtime);
  }

  async stop(): Promise<void> {
    // Cleanup
  }
}

// Helper to create mock runtime
const createMockRuntime = (): IAgentRuntime => {
  const services = new Map<ServiceTypeName, Service>();
  const actions: Action[] = [];
  const providers: Provider[] = [];
  const evaluators: Evaluator[] = [];
  const plugins: Plugin[] = [];

  return {
    agentId: uuidv4() as any,
    plugins,
    actions,
    providers,
    evaluators,
    services,

    registerAction: vi.fn(async (action: Action) => {
      actions.push(action);
    }),

    registerProvider: vi.fn(async (provider: Provider) => {
      providers.push(provider);
    }),

    registerEvaluator: vi.fn(async (evaluator: Evaluator) => {
      evaluators.push(evaluator);
    }),

    getService: vi.fn((serviceType: ServiceTypeName) => {
      return services.get(serviceType);
    }),

    emitEvent: vi.fn(async () => {}),
    getSetting: vi.fn(() => null),
    getWorldId: vi.fn(() => uuidv4() as any),
    useModel: vi.fn(async () => 'mock response'),
  } as any;
};

// Helper to create test plugin
const createTestPlugin = (name: string): Plugin => ({
  name,
  description: `Test plugin ${name}`,
  actions: [
    {
      name: `${name}_ACTION_1`,
      similes: [`${name} action 1`],
      description: `First action for ${name}`,
      examples: [],
      validate: async () => true,
      handler: async () => {},
    },
    {
      name: `${name}_ACTION_2`,
      similes: [`${name} action 2`],
      description: `Second action for ${name}`,
      examples: [],
      validate: async () => true,
      handler: async () => {},
    },
  ],
  providers: [
    {
      name: `${name}_PROVIDER`,
      description: `Provider for ${name}`,
      get: async () => ({
        text: `${name} provider data`,
        values: {},
        data: {},
      }),
    },
  ],
  evaluators: [
    {
      name: `${name}_EVALUATOR`,
      description: `Evaluator for ${name}`,
      examples: [],
      validate: async () => true,
      handler: async () => {},
    },
  ],
  services: [TestService],
});

describe('Component Tracking', () => {
  let runtime: IAgentRuntime;
  let pluginManager: PluginManagerService;

  beforeEach(() => {
    runtime = createMockRuntime();
    pluginManager = new PluginManagerService(runtime);
    runtime.services.set('PLUGIN_MANAGER' as ServiceTypeName, pluginManager);
  });

  describe('Component Registration Tracking', () => {
    it('should track all component types when plugin is loaded', async () => {
      const plugin = createTestPlugin('test');
      const pluginId = await pluginManager.registerPlugin(plugin);

      await pluginManager.loadPlugin({ pluginId });

      // Check plugin components are tracked
      const components = pluginManager.getPluginComponents(pluginId);
      expect(components).toBeDefined();
      expect(components!.actions.size).toBe(2);
      expect(components!.actions.has('test_ACTION_1')).toBe(true);
      expect(components!.actions.has('test_ACTION_2')).toBe(true);
      expect(components!.providers.size).toBe(1);
      expect(components!.providers.has('test_PROVIDER')).toBe(true);
      expect(components!.evaluators.size).toBe(1);
      expect(components!.evaluators.has('test_EVALUATOR')).toBe(true);
      expect(components!.services.size).toBe(1);
      expect(components!.services.has('TEST_SERVICE')).toBe(true);
    });

    it('should maintain component registry with timestamps', async () => {
      const plugin = createTestPlugin('test');
      const pluginId = await pluginManager.registerPlugin(plugin);

      const beforeLoad = Date.now();
      await pluginManager.loadPlugin({ pluginId });
      const afterLoad = Date.now();

      const registrations = pluginManager.getComponentRegistrations(pluginId);
      expect(registrations.length).toBe(5); // 2 actions + 1 provider + 1 evaluator + 1 service

      // Check all registrations have correct structure
      for (const reg of registrations) {
        expect(reg.pluginId).toBe(pluginId);
        expect(reg.timestamp).toBeGreaterThanOrEqual(beforeLoad);
        expect(reg.timestamp).toBeLessThanOrEqual(afterLoad);
        expect(['action', 'provider', 'evaluator', 'service']).toContain(reg.componentType);
      }

      // Check specific registrations
      const actionRegs = registrations.filter((r) => r.componentType === 'action');
      expect(actionRegs.length).toBe(2);
      expect(actionRegs.map((r) => r.componentName)).toContain('test_ACTION_1');
      expect(actionRegs.map((r) => r.componentName)).toContain('test_ACTION_2');
    });

    it('should initialize empty components for new plugins', async () => {
      const plugin = createTestPlugin('test');
      const pluginId = await pluginManager.registerPlugin(plugin);

      // Before loading, components should be initialized but empty
      const components = pluginManager.getPluginComponents(pluginId);
      expect(components).toBeDefined();
      expect(components!.actions.size).toBe(0);
      expect(components!.providers.size).toBe(0);
      expect(components!.evaluators.size).toBe(0);
      expect(components!.services.size).toBe(0);
      expect(components!.eventHandlers.size).toBe(0);
    });
  });

  describe('Component Unregistration Tracking', () => {
    it('should remove components from tracking when plugin is unloaded', async () => {
      const plugin = createTestPlugin('test');
      const pluginId = await pluginManager.registerPlugin(plugin);
      await pluginManager.loadPlugin({ pluginId });

      // Verify components are tracked
      let components = pluginManager.getPluginComponents(pluginId);
      expect(components!.actions.size).toBe(2);
      expect(components!.providers.size).toBe(1);

      // Unload plugin
      await pluginManager.unloadPlugin({ pluginId });

      // Components should be cleared
      components = pluginManager.getPluginComponents(pluginId);
      expect(components!.actions.size).toBe(0);
      expect(components!.providers.size).toBe(0);
      expect(components!.evaluators.size).toBe(0);
      expect(components!.services.size).toBe(0);

      // Component registry should be cleared
      const registrations = pluginManager.getComponentRegistrations(pluginId);
      expect(registrations.length).toBe(0);
    });

    it('should not remove original components', async () => {
      // Add original components to runtime
      const originalAction: Action = {
        name: 'ORIGINAL_ACTION',
        similes: ['original'],
        description: 'Original action',
        examples: [],
        validate: async () => true,
        handler: async () => {},
      };
      runtime.actions.push(originalAction);

      // Create new plugin manager to capture originals
      pluginManager = new PluginManagerService(runtime);

      // Register and load a plugin with conflicting name
      const plugin: Plugin = {
        name: 'test',
        description: 'Test plugin with conflicting names',
        actions: [
          {
            name: 'ORIGINAL_ACTION', // Same name as original
            similes: ['test'],
            description: 'Test action',
            examples: [],
            validate: async () => true,
            handler: async () => {},
          },
          {
            name: 'NEW_ACTION',
            similes: ['new'],
            description: 'New action',
            examples: [],
            validate: async () => true,
            handler: async () => {},
          },
        ],
      };

      const pluginId = await pluginManager.registerPlugin(plugin);
      await pluginManager.loadPlugin({ pluginId });

      // Both actions should be in runtime (original + 2 from plugin)
      expect(runtime.actions.length).toBe(3);

      // Unload plugin
      await pluginManager.unloadPlugin({ pluginId });

      // The NEW_ACTION should definitely be removed
      const remainingActionNames = runtime.actions.map((a) => a.name);
      expect(remainingActionNames).not.toContain('NEW_ACTION');

      // Due to duplicate names, we can't guarantee which ORIGINAL_ACTION remains,
      // but at least one should remain
      expect(
        remainingActionNames.filter((name) => name === 'ORIGINAL_ACTION').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('should handle service stop errors gracefully', async () => {
      const plugin: Plugin = {
        name: 'test',
        description: 'Test plugin with failing service',
        services: [TestService],
      };

      const pluginId = await pluginManager.registerPlugin(plugin);
      await pluginManager.loadPlugin({ pluginId });

      // Get the registered service and replace its stop method
      const service = runtime.services.get('TEST_SERVICE' as ServiceTypeName);
      if (service) {
        service.stop = vi.fn().mockRejectedValue(new Error('Service stop failed'));
      }

      // Unload should not throw even if service stop fails
      await expect(pluginManager.unloadPlugin({ pluginId })).resolves.not.toThrow();

      // Service should still be removed from runtime
      expect(runtime.services.has('TEST_SERVICE' as ServiceTypeName)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle plugins without components', async () => {
      const emptyPlugin: Plugin = {
        name: 'empty',
        description: 'Empty plugin',
      };

      const pluginId = await pluginManager.registerPlugin(emptyPlugin);
      await pluginManager.loadPlugin({ pluginId });

      const components = pluginManager.getPluginComponents(pluginId);
      expect(components).toBeDefined();
      expect(components!.actions.size).toBe(0);
      expect(components!.providers.size).toBe(0);
      expect(components!.evaluators.size).toBe(0);
      expect(components!.services.size).toBe(0);
    });

    it('should handle missing plugin state during unregistration', async () => {
      const plugin = createTestPlugin('test');

      // Manually call unregisterPluginComponents without proper setup
      // This should not throw
      await expect(
        (pluginManager as any).unregisterPluginComponents(plugin)
      ).resolves.not.toThrow();
    });

    it('should track components for multiple plugins independently', async () => {
      const plugin1 = createTestPlugin('plugin1');
      const plugin2 = createTestPlugin('plugin2');

      const pluginId1 = await pluginManager.registerPlugin(plugin1);
      const pluginId2 = await pluginManager.registerPlugin(plugin2);

      await pluginManager.loadPlugin({ pluginId: pluginId1 });
      await pluginManager.loadPlugin({ pluginId: pluginId2 });

      // Check both plugins have their own components
      const components1 = pluginManager.getPluginComponents(pluginId1);
      const components2 = pluginManager.getPluginComponents(pluginId2);

      expect(components1!.actions.has('plugin1_ACTION_1')).toBe(true);
      expect(components1!.actions.has('plugin2_ACTION_1')).toBe(false);

      expect(components2!.actions.has('plugin2_ACTION_1')).toBe(true);
      expect(components2!.actions.has('plugin1_ACTION_1')).toBe(false);

      // Unload plugin1
      await pluginManager.unloadPlugin({ pluginId: pluginId1 });

      // Plugin2 components should remain
      const components2After = pluginManager.getPluginComponents(pluginId2);
      expect(components2After!.actions.size).toBe(2);
      expect(components2After!.providers.size).toBe(1);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory when loading/unloading plugins repeatedly', async () => {
      const plugin = createTestPlugin('test');

      for (let i = 0; i < 10; i++) {
        const pluginId = await pluginManager.registerPlugin({
          ...plugin,
          name: `test_${i}`,
        });

        await pluginManager.loadPlugin({ pluginId });
        await pluginManager.unloadPlugin({ pluginId });
      }

      // All plugins should be in unloaded state
      const allPlugins = pluginManager.getAllPlugins();
      const unloadedCount = allPlugins.filter((p) => p.status === PluginStatus.UNLOADED).length;
      expect(unloadedCount).toBe(10);

      // Component registries should be cleaned up
      for (const plugin of allPlugins) {
        const registrations = pluginManager.getComponentRegistrations(plugin.id);
        expect(registrations.length).toBe(0);
      }
    });
  });
});
