import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManagerService } from '../services/pluginManagerService';
import { type IAgentRuntime, type Plugin, type UUID } from '@elizaos/core';
import { PluginStatus } from '../types';

describe('Event Handler Management', () => {
  let mockRuntime: IAgentRuntime;
  let pluginManager: PluginManagerService;

  beforeEach(() => {
    // Create a mock runtime with events map
    mockRuntime = {
      agentId: 'test-agent-id' as UUID,
      plugins: [],
      events: new Map(),
      registerPlugin: vi.fn(),
      registerAction: vi.fn(),
      registerProvider: vi.fn(),
      registerEvaluator: vi.fn(),
      registerEvent: vi.fn((event: string, handler: Function) => {
        const handlers = mockRuntime.events.get(event) || [];
        handlers.push(handler as any);
        mockRuntime.events.set(event, handlers);
      }),
      emitEvent: vi.fn(),
      actions: [],
      providers: [],
      evaluators: [],
      services: new Map(),
    } as any;

    pluginManager = new PluginManagerService(mockRuntime);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should track event handlers when plugin is registered', async () => {
    const mockEventHandler1 = vi.fn();
    const mockEventHandler2 = vi.fn();

    const testPlugin: Plugin = {
      name: 'test-plugin',
      description: 'Test plugin for event handler management',
      events: {
        'test:event': [mockEventHandler1],
        'another:event': [mockEventHandler2],
      },
    };

    const pluginId = await pluginManager.registerPlugin(testPlugin);
    await pluginManager.loadPlugin({ pluginId });

    // Get plugin state
    const pluginState = pluginManager.getPlugin(pluginId);
    expect(pluginState).toBeDefined();
    expect(pluginState?.components?.eventHandlers).toBeDefined();

    // Check that event handlers are tracked
    const eventHandlers = pluginState?.components?.eventHandlers;
    expect(eventHandlers?.has('test:event')).toBe(true);
    expect(eventHandlers?.has('another:event')).toBe(true);
    expect(eventHandlers?.get('test:event')?.has(mockEventHandler1)).toBe(true);
    expect(eventHandlers?.get('another:event')?.has(mockEventHandler2)).toBe(true);

    // Verify handlers were registered with runtime
    expect(mockRuntime.registerEvent).toHaveBeenCalledWith('test:event', mockEventHandler1);
    expect(mockRuntime.registerEvent).toHaveBeenCalledWith('another:event', mockEventHandler2);
  });

  it('should unregister event handlers when plugin is unloaded', async () => {
    const mockEventHandler = vi.fn();

    const testPlugin: Plugin = {
      name: 'test-plugin',
      description: 'Test plugin for unregister test',
      events: {
        'test:event': [mockEventHandler],
      },
    };

    // Add unregisterEvent method to runtime
    (mockRuntime as any).unregisterEvent = vi.fn((event: string, handler: Function) => {
      const handlers = mockRuntime.events.get(event);
      if (handlers) {
        const filtered = handlers.filter((h: any) => h !== handler);
        if (filtered.length > 0) {
          mockRuntime.events.set(event, filtered);
        } else {
          mockRuntime.events.delete(event);
        }
      }
    });

    const pluginId = await pluginManager.registerPlugin(testPlugin);
    await pluginManager.loadPlugin({ pluginId });

    // Verify handler was registered
    expect(mockRuntime.events.get('test:event')).toContain(mockEventHandler);

    // Unload plugin
    await pluginManager.unloadPlugin({ pluginId });

    // Verify handler was unregistered
    expect((mockRuntime as any).unregisterEvent).toHaveBeenCalledWith(
      'test:event',
      mockEventHandler
    );
    expect(mockRuntime.events.has('test:event')).toBe(false);

    // Verify event handlers are cleared from plugin state
    const pluginState = pluginManager.getPlugin(pluginId);
    expect(pluginState?.components?.eventHandlers.size).toBe(0);
  });

  it('should handle multiple handlers for the same event', async () => {
    const mockHandler1 = vi.fn();
    const mockHandler2 = vi.fn();
    const mockHandler3 = vi.fn();

    const testPlugin: Plugin = {
      name: 'test-plugin',
      description: 'Test plugin for multiple handlers',
      events: {
        'shared:event': [mockHandler1, mockHandler2],
        'another:event': [mockHandler3],
      },
    };

    const pluginId = await pluginManager.registerPlugin(testPlugin);
    await pluginManager.loadPlugin({ pluginId });

    // Verify all handlers were registered
    const sharedHandlers = mockRuntime.events.get('shared:event');
    expect(sharedHandlers).toHaveLength(2);
    expect(sharedHandlers).toContain(mockHandler1);
    expect(sharedHandlers).toContain(mockHandler2);

    const anotherHandlers = mockRuntime.events.get('another:event');
    expect(anotherHandlers).toHaveLength(1);
    expect(anotherHandlers).toContain(mockHandler3);

    // Check plugin state tracking
    const pluginState = pluginManager.getPlugin(pluginId);
    const eventHandlers = pluginState?.components?.eventHandlers;
    expect(eventHandlers?.get('shared:event')?.size).toBe(2);
    expect(eventHandlers?.get('another:event')?.size).toBe(1);
  });

  it('should not unregister handlers from other plugins', async () => {
    const plugin1Handler = vi.fn();
    const plugin2Handler = vi.fn();

    // Add unregisterEvent method
    (mockRuntime as any).unregisterEvent = vi.fn((event: string, handler: Function) => {
      const handlers = mockRuntime.events.get(event);
      if (handlers) {
        const filtered = handlers.filter((h: any) => h !== handler);
        if (filtered.length > 0) {
          mockRuntime.events.set(event, filtered);
        } else {
          mockRuntime.events.delete(event);
        }
      }
    });

    const plugin1: Plugin = {
      name: 'plugin-1',
      description: 'First test plugin for shared events',
      events: {
        'shared:event': [plugin1Handler],
      },
    };

    const plugin2: Plugin = {
      name: 'plugin-2',
      description: 'Second test plugin for shared events',
      events: {
        'shared:event': [plugin2Handler],
      },
    };

    // Load both plugins
    const pluginId1 = await pluginManager.registerPlugin(plugin1);
    const pluginId2 = await pluginManager.registerPlugin(plugin2);
    await pluginManager.loadPlugin({ pluginId: pluginId1 });
    await pluginManager.loadPlugin({ pluginId: pluginId2 });

    // Verify both handlers are registered
    const handlers = mockRuntime.events.get('shared:event');
    expect(handlers).toHaveLength(2);
    expect(handlers).toContain(plugin1Handler);
    expect(handlers).toContain(plugin2Handler);

    // Unload plugin 1
    await pluginManager.unloadPlugin({ pluginId: pluginId1 });

    // Verify only plugin1's handler was removed
    const remainingHandlers = mockRuntime.events.get('shared:event');
    expect(remainingHandlers).toHaveLength(1);
    expect(remainingHandlers).toContain(plugin2Handler);
    expect(remainingHandlers).not.toContain(plugin1Handler);

    // Verify plugin 2's state is intact
    const plugin2State = pluginManager.getPlugin(pluginId2);
    expect(plugin2State?.components?.eventHandlers.get('shared:event')?.has(plugin2Handler)).toBe(
      true
    );
  });

  it('should clear all event handlers from plugin state after unload', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();

    const testPlugin: Plugin = {
      name: 'test-plugin',
      description: 'Test plugin for clearing event handlers',
      events: {
        'event:one': [handler1],
        'event:two': [handler2, handler3],
      },
    };

    // Add unregisterEvent method
    (mockRuntime as any).unregisterEvent = vi.fn();

    const pluginId = await pluginManager.registerPlugin(testPlugin);
    await pluginManager.loadPlugin({ pluginId });

    // Verify handlers are tracked
    const pluginState = pluginManager.getPlugin(pluginId);
    expect(pluginState?.components?.eventHandlers.size).toBe(2);

    // Unload plugin
    await pluginManager.unloadPlugin({ pluginId });

    // Verify all handlers are cleared
    const unloadedState = pluginManager.getPlugin(pluginId);
    expect(unloadedState?.components?.eventHandlers.size).toBe(0);
    expect(unloadedState?.status).toBe(PluginStatus.UNLOADED);
  });
});
