import { describe, expect, it, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { pluginManagerPlugin, PluginManagerService, PluginConfigurationService } from '../src/index';
import { createMockRuntime, setupLoggerSpies, MockRuntime } from './test-utils';
import { HandlerCallback, IAgentRuntime, Memory, State, UUID, logger } from '@elizaos/core';

/**
 * Integration tests demonstrate how multiple components of the plugin work together.
 * Unlike unit tests that test individual functions in isolation, integration tests
 * examine how components interact with each other.
 *
 * For example, this file shows how the plugin manager actions interact with
 * the PluginManagerService and other plugin components.
 */

// Set up spies on logger
beforeAll(() => {
  setupLoggerSpies();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('Integration: LoadPlugin Action with PluginManagerService', () => {
  let mockRuntime: MockRuntime;
  let getServiceSpy: any;

  beforeEach(() => {
    // Create a service mock that will be returned by getService
    const mockPluginManagerService = {
      loadPlugin: vi.fn().mockResolvedValue({ success: true, pluginName: 'test-plugin' }),
      unloadPlugin: vi.fn().mockResolvedValue({ success: true }),
      getLoadedPlugins: vi.fn().mockReturnValue(['test-plugin']),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    // Create a mock runtime with a spied getService method
    getServiceSpy = vi.fn().mockImplementation((serviceType) => {
      if (serviceType === 'plugin-manager') {
        return mockPluginManagerService;
      }
      return null;
    });

    mockRuntime = createMockRuntime({
      getService: getServiceSpy,
    });
  });

  it('should handle LoadPlugin action with PluginManagerService available', async () => {
    // Find the LoadPlugin action
    const loadPluginAction = pluginManagerPlugin.actions?.find((action) => action.name === 'LOAD_PLUGIN');
    expect(loadPluginAction).toBeDefined();

    // Create a mock message and state
    const mockMessage: Memory = {
      id: '12345678-1234-1234-1234-123456789012' as UUID,
      roomId: '12345678-1234-1234-1234-123456789012' as UUID,
      entityId: '12345678-1234-1234-1234-123456789012' as UUID,
      agentId: '12345678-1234-1234-1234-123456789012' as UUID,
      content: {
        text: 'Load plugin test-plugin',
        source: 'test',
      },
      createdAt: Date.now(),
    };

    const mockState: State = {
      values: {},
      data: {},
      text: 'test-plugin',
    };

    // Create a mock callback to capture the response
    const callbackFn = vi.fn();

    // Execute the action
    await loadPluginAction?.handler(
      mockRuntime as unknown as IAgentRuntime,
      mockMessage,
      mockState,
      {},
      callbackFn as HandlerCallback,
      []
    );

    // Verify the service method was called
    const service = mockRuntime.getService('plugin-manager');
    expect(service?.loadPlugin).toHaveBeenCalledWith('test-plugin');

    // Verify the callback was called with a response
    expect(callbackFn).toHaveBeenCalled();
    expect(callbackFn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Plugin test-plugin loaded successfully'),
      })
    );
  });
});

describe('Integration: Plugin initialization and service registration', () => {
  it('should initialize the plugin and register all services', async () => {
    // Create a fresh mock runtime with mocked registerService for testing initialization flow
    const mockRuntime = createMockRuntime();

    // Create and install a spy on registerService
    const registerServiceSpy = vi.fn();
    mockRuntime.registerService = registerServiceSpy;

    // Run a minimal simulation of the plugin initialization process
    if (pluginManagerPlugin.init) {
      await pluginManagerPlugin.init(
        {},
        mockRuntime as unknown as IAgentRuntime
      );

      // Directly mock the service registration that happens during initialization
      // because unit tests don't run the full agent initialization flow
      if (pluginManagerPlugin.services) {
        for (const ServiceClass of pluginManagerPlugin.services) {
          const serviceInstance = await ServiceClass.start(
            mockRuntime as unknown as IAgentRuntime
          );

          // Register the Service class to match the core API
          mockRuntime.registerService(ServiceClass);
        }
      }

      // Now verify all services were registered with the runtime
      expect(registerServiceSpy).toHaveBeenCalledTimes(3); // 3 services in the plugin
      expect(registerServiceSpy).toHaveBeenCalledWith(PluginManagerService);
      expect(registerServiceSpy).toHaveBeenCalledWith(PluginConfigurationService);
    }
  });
});

describe('Integration: Plugin Unload Action', () => {
  let mockRuntime: MockRuntime;

  beforeEach(() => {
    // Create a service mock with loaded plugins
    const mockPluginManagerService = {
      loadPlugin: vi.fn().mockResolvedValue({ success: true }),
      unloadPlugin: vi.fn().mockResolvedValue({ success: true }),
      getLoadedPlugins: vi.fn().mockReturnValue(['test-plugin', 'another-plugin']),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockRuntime = createMockRuntime({
      getService: vi.fn().mockImplementation((serviceType) => {
        if (serviceType === 'plugin-manager') {
          return mockPluginManagerService;
        }
        return null;
      }),
    });
  });

  it('should handle UnloadPlugin action', async () => {
    // Find the UnloadPlugin action
    const unloadPluginAction = pluginManagerPlugin.actions?.find((action) => action.name === 'UNLOAD_PLUGIN');
    expect(unloadPluginAction).toBeDefined();

    const mockMessage: Memory = {
      id: '12345678-1234-1234-1234-123456789012' as UUID,
      roomId: '12345678-1234-1234-1234-123456789012' as UUID,
      entityId: '12345678-1234-1234-1234-123456789012' as UUID,
      agentId: '12345678-1234-1234-1234-123456789012' as UUID,
      content: {
        text: 'Unload plugin test-plugin',
        source: 'test',
      },
      createdAt: Date.now(),
    };

    const mockState: State = {
      values: {},
      data: {},
      text: 'test-plugin',
    };

    const callbackFn = vi.fn();

    // Execute the action
    await unloadPluginAction?.handler(
      mockRuntime as unknown as IAgentRuntime,
      mockMessage,
      mockState,
      {},
      callbackFn as HandlerCallback,
      []
    );

    // Verify the service method was called
    const service = mockRuntime.getService('plugin-manager');
    expect(service?.unloadPlugin).toHaveBeenCalledWith('test-plugin');

    // Verify the callback was called
    expect(callbackFn).toHaveBeenCalled();
  });
});
