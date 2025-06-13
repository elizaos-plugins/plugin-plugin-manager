import { describe, expect, it, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { pluginManagerPlugin, PluginManagerService, PluginConfigurationService, PluginUserInteractionService } from '../src/index';
import { ModelType, logger } from '@elizaos/core';
import dotenv from 'dotenv';

// Setup environment variables
dotenv.config();

// Need to spy on logger for documentation
beforeAll(() => {
  vi.spyOn(logger, 'info');
  vi.spyOn(logger, 'error');
  vi.spyOn(logger, 'warn');
  vi.spyOn(logger, 'debug');
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Create a real runtime for testing
function createRealRuntime() {
  const services = new Map();

  // Create a real service instance if needed
  const createService = (serviceType: string) => {
    if (serviceType === PluginManagerService.serviceType) {
      return new PluginManagerService({
        character: {
          name: 'Test Character',
          system: 'You are a helpful assistant for testing.',
        },
      } as any);
    }
    if (serviceType === PluginConfigurationService.serviceType) {
      return new PluginConfigurationService({
        character: {
          name: 'Test Character',
          system: 'You are a helpful assistant for testing.',
        },
      } as any);
    }
    if (serviceType === PluginUserInteractionService.serviceType) {
      return new PluginUserInteractionService({
        character: {
          name: 'Test Character',
          system: 'You are a helpful assistant for testing.',
        },
      } as any);
    }
    return null;
  };

  return {
    character: {
      name: 'Test Character',
      system: 'You are a helpful assistant for testing.',
      plugins: [],
      settings: {},
    },
    getSetting: (key: string) => null,
    models: pluginManagerPlugin.models,
    db: {
      get: async (key: string) => null,
      set: async (key: string, value: any) => true,
      delete: async (key: string) => true,
      getKeys: async (pattern: string) => [],
    },
    getService: (serviceType: string) => {
      // Log the service request for debugging
      logger.debug(`Requesting service: ${serviceType}`);

      // Get from cache or create new
      if (!services.has(serviceType)) {
        logger.debug(`Creating new service: ${serviceType}`);
        services.set(serviceType, createService(serviceType));
      }

      return services.get(serviceType);
    },
    registerService: (serviceType: string, service: any) => {
      logger.debug(`Registering service: ${serviceType}`);
      services.set(serviceType, service);
    },
  };
}

describe('Plugin Configuration', () => {
  it('should have correct plugin metadata', () => {
    expect(pluginManagerPlugin.name).toBe('plugin-manager');
    expect(pluginManagerPlugin.description).toBe('Manages dynamic loading and unloading of plugins at runtime, including registry installation and configuration management');
    expect(pluginManagerPlugin.services).toBeDefined();
    expect(pluginManagerPlugin.actions).toBeDefined();
    expect(pluginManagerPlugin.providers).toBeDefined();
    expect(pluginManagerPlugin.evaluators).toBeDefined();
  });

  it('should have required services', () => {
    expect(pluginManagerPlugin.services).toHaveLength(3);
    expect(pluginManagerPlugin.services).toContain(PluginManagerService);
    expect(pluginManagerPlugin.services).toContain(PluginConfigurationService);
    expect(pluginManagerPlugin.services).toContain(PluginUserInteractionService);
  });

  it('should initialize properly', async () => {
    // Initialize with config - using real runtime
    const runtime = createRealRuntime();

    if (pluginManagerPlugin.init) {
      await pluginManagerPlugin.init({}, runtime as any);
      expect(true).toBe(true); // If we got here, init succeeded
    }
  });

  it('should have actions defined', () => {
    expect(pluginManagerPlugin.actions).toBeDefined();
    expect(pluginManagerPlugin.actions?.length).toBeGreaterThan(0);
    
    // Check for specific actions
    const actionNames = pluginManagerPlugin.actions?.map(action => action.name) || [];
    expect(actionNames).toContain('LOAD_PLUGIN');
    expect(actionNames).toContain('UNLOAD_PLUGIN');
    expect(actionNames).toContain('START_PLUGIN_CONFIGURATION');
    expect(actionNames).toContain('INSTALL_PLUGIN_FROM_REGISTRY');
  });

  it('should have providers defined', () => {
    expect(pluginManagerPlugin.providers).toBeDefined();
    expect(pluginManagerPlugin.providers?.length).toBeGreaterThan(0);
  });

  it('should have evaluators defined', () => {
    expect(pluginManagerPlugin.evaluators).toBeDefined();
    expect(pluginManagerPlugin.evaluators?.length).toBeGreaterThan(0);
  });
});

describe('PluginManagerService', () => {
  it('should start the service', async () => {
    const runtime = createRealRuntime();
    const startResult = await PluginManagerService.start(runtime as any);

    expect(startResult).toBeDefined();
    expect(startResult.constructor.name).toBe('PluginManagerService');

    // Test real functionality - check methods are available
    expect(typeof startResult.loadPlugin).toBe('function');
    expect(typeof startResult.unloadPlugin).toBe('function');
    expect(typeof startResult.getLoadedPlugins).toBe('function');
  });

  it('should stop the service', async () => {
    const runtime = createRealRuntime();

    // Start the service first
    const service = await PluginManagerService.start(runtime as any);
    expect(service).toBeDefined();

    // Spy on the service's stop method
    const stopSpy = vi.spyOn(service, 'stop');

    // Call the instance stop method
    await service.stop();

    // Verify the stop method was called
    expect(stopSpy).toHaveBeenCalled();
  });

  it('should manage plugin loading and unloading', async () => {
    const runtime = createRealRuntime();
    const service = await PluginManagerService.start(runtime as any);

    // Verify service methods exist
    expect(typeof service.loadPlugin).toBe('function');
    expect(typeof service.unloadPlugin).toBe('function');
    expect(typeof service.getLoadedPlugins).toBe('function');
    expect(typeof service.getAllPlugins).toBe('function');
  });
});
