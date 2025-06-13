import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyRuntimeExtensions,
  extendRuntimeWithEventUnregistration,
  extendRuntimeWithComponentUnregistration,
} from '../coreExtensions';
import type { IAgentRuntime, Action, Provider, Evaluator } from '@elizaos/core';

describe('coreExtensions', () => {
  let mockRuntime: IAgentRuntime;

  beforeEach(() => {
    mockRuntime = {
      actions: [],
      providers: [],
      evaluators: [],
      services: new Map(),
      events: new Map(),
      registerAction: vi.fn(),
      registerProvider: vi.fn(),
      registerEvaluator: vi.fn(),
      registerEvent: vi.fn(),
      registerService: vi.fn(),
    } as any;
  });

  describe('extendRuntimeWithEventUnregistration', () => {
    it('should add unregisterEvent method to runtime', () => {
      extendRuntimeWithEventUnregistration(mockRuntime);
      expect((mockRuntime as any).unregisterEvent).toBeDefined();
    });

    it('should not override existing unregisterEvent method', () => {
      const existingMethod = vi.fn();
      (mockRuntime as any).unregisterEvent = existingMethod;

      extendRuntimeWithEventUnregistration(mockRuntime);

      expect((mockRuntime as any).unregisterEvent).toBe(existingMethod);
    });

    it('should unregister event handlers correctly', () => {
      extendRuntimeWithEventUnregistration(mockRuntime);

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const eventName = 'TEST_EVENT';

      // Setup event handlers
      mockRuntime.events.set(eventName, [handler1, handler2]);

      // Unregister one handler
      (mockRuntime as any).unregisterEvent(eventName, handler1);

      const handlers = mockRuntime.events.get(eventName);
      expect(handlers).toHaveLength(1);
      expect(handlers![0]).toBe(handler2);
    });

    it('should remove event entry when all handlers are unregistered', () => {
      extendRuntimeWithEventUnregistration(mockRuntime);

      const handler = vi.fn();
      const eventName = 'TEST_EVENT';

      mockRuntime.events.set(eventName, [handler]);

      (mockRuntime as any).unregisterEvent(eventName, handler);

      expect(mockRuntime.events.has(eventName)).toBe(false);
    });

    it('should handle non-existent event gracefully', () => {
      extendRuntimeWithEventUnregistration(mockRuntime);

      expect(() => {
        (mockRuntime as any).unregisterEvent('NON_EXISTENT', vi.fn());
      }).not.toThrow();
    });
  });

  describe('extendRuntimeWithComponentUnregistration', () => {
    beforeEach(() => {
      extendRuntimeWithComponentUnregistration(mockRuntime);
    });

    describe('unregisterAction', () => {
      it('should add unregisterAction method', () => {
        expect((mockRuntime as any).unregisterAction).toBeDefined();
      });

      it('should remove action from runtime actions array', () => {
        const action: Action = { name: 'TEST_ACTION' } as any;
        mockRuntime.actions.push(action);

        (mockRuntime as any).unregisterAction('TEST_ACTION');

        expect(mockRuntime.actions).toHaveLength(0);
      });

      it('should handle non-existent action gracefully', () => {
        expect(() => {
          (mockRuntime as any).unregisterAction('NON_EXISTENT');
        }).not.toThrow();
      });

      it('should only remove the specified action', () => {
        const action1: Action = { name: 'ACTION1' } as any;
        const action2: Action = { name: 'ACTION2' } as any;
        mockRuntime.actions.push(action1, action2);

        (mockRuntime as any).unregisterAction('ACTION1');

        expect(mockRuntime.actions).toHaveLength(1);
        expect(mockRuntime.actions[0].name).toBe('ACTION2');
      });
    });

    describe('unregisterProvider', () => {
      it('should add unregisterProvider method', () => {
        expect((mockRuntime as any).unregisterProvider).toBeDefined();
      });

      it('should remove provider from runtime providers array', () => {
        const provider: Provider = { name: 'TEST_PROVIDER', get: vi.fn() };
        mockRuntime.providers.push(provider);

        (mockRuntime as any).unregisterProvider('TEST_PROVIDER');

        expect(mockRuntime.providers).toHaveLength(0);
      });

      it('should handle non-existent provider gracefully', () => {
        expect(() => {
          (mockRuntime as any).unregisterProvider('NON_EXISTENT');
        }).not.toThrow();
      });

      it('should only remove the specified provider', () => {
        const provider1: Provider = { name: 'PROVIDER1', get: vi.fn() };
        const provider2: Provider = { name: 'PROVIDER2', get: vi.fn() };
        mockRuntime.providers.push(provider1, provider2);

        (mockRuntime as any).unregisterProvider('PROVIDER1');

        expect(mockRuntime.providers).toHaveLength(1);
        expect(mockRuntime.providers[0].name).toBe('PROVIDER2');
      });
    });

    describe('unregisterEvaluator', () => {
      it('should add unregisterEvaluator method', () => {
        expect((mockRuntime as any).unregisterEvaluator).toBeDefined();
      });

      it('should remove evaluator from runtime evaluators array', () => {
        const evaluator: Evaluator = {
          name: 'TEST_EVALUATOR',
          handler: vi.fn(),
          validate: vi.fn(),
          description: 'Test evaluator',
          examples: [],
        };
        mockRuntime.evaluators.push(evaluator);

        (mockRuntime as any).unregisterEvaluator('TEST_EVALUATOR');

        expect(mockRuntime.evaluators).toHaveLength(0);
      });

      it('should handle non-existent evaluator gracefully', () => {
        expect(() => {
          (mockRuntime as any).unregisterEvaluator('NON_EXISTENT');
        }).not.toThrow();
      });

      it('should only remove the specified evaluator', () => {
        const evaluator1: Evaluator = {
          name: 'EVALUATOR1',
          handler: vi.fn(),
          validate: vi.fn(),
          description: 'Test evaluator 1',
          examples: [],
        };
        const evaluator2: Evaluator = {
          name: 'EVALUATOR2',
          handler: vi.fn(),
          validate: vi.fn(),
          description: 'Test evaluator 2',
          examples: [],
        };
        mockRuntime.evaluators.push(evaluator1, evaluator2);

        (mockRuntime as any).unregisterEvaluator('EVALUATOR1');

        expect(mockRuntime.evaluators).toHaveLength(1);
        expect(mockRuntime.evaluators[0].name).toBe('EVALUATOR2');
      });
    });

    describe('unregisterService', () => {
      it('should add unregisterService method', () => {
        expect((mockRuntime as any).unregisterService).toBeDefined();
      });

      it('should stop and remove service from runtime services map', async () => {
        const service = { stop: vi.fn() };
        mockRuntime.services.set('TEST_SERVICE' as any, service as any);

        await (mockRuntime as any).unregisterService('TEST_SERVICE');

        expect(service.stop).toHaveBeenCalled();
        expect(mockRuntime.services.has('TEST_SERVICE' as any)).toBe(false);
      });

      it('should handle service stop errors gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = {
          stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
        };
        mockRuntime.services.set('TEST_SERVICE' as any, service as any);

        await (mockRuntime as any).unregisterService('TEST_SERVICE');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error stopping service TEST_SERVICE:',
          expect.any(Error)
        );
        expect(mockRuntime.services.has('TEST_SERVICE' as any)).toBe(false);

        consoleErrorSpy.mockRestore();
      });

      it('should handle non-existent service gracefully', async () => {
        await expect((mockRuntime as any).unregisterService('NON_EXISTENT')).resolves.not.toThrow();
      });
    });

    it('should not override existing methods', () => {
      const runtime = {
        ...mockRuntime,
        unregisterAction: vi.fn(),
        unregisterProvider: vi.fn(),
        unregisterEvaluator: vi.fn(),
        unregisterService: vi.fn(),
      } as any;

      const originalMethods = {
        unregisterAction: runtime.unregisterAction,
        unregisterProvider: runtime.unregisterProvider,
        unregisterEvaluator: runtime.unregisterEvaluator,
        unregisterService: runtime.unregisterService,
      };

      extendRuntimeWithComponentUnregistration(runtime);

      expect(runtime.unregisterAction).toBe(originalMethods.unregisterAction);
      expect(runtime.unregisterProvider).toBe(originalMethods.unregisterProvider);
      expect(runtime.unregisterEvaluator).toBe(originalMethods.unregisterEvaluator);
      expect(runtime.unregisterService).toBe(originalMethods.unregisterService);
    });
  });

  describe('applyRuntimeExtensions', () => {
    it('should apply both event and component unregistration extensions', () => {
      applyRuntimeExtensions(mockRuntime);

      expect((mockRuntime as any).unregisterEvent).toBeDefined();
      expect((mockRuntime as any).unregisterAction).toBeDefined();
      expect((mockRuntime as any).unregisterProvider).toBeDefined();
      expect((mockRuntime as any).unregisterEvaluator).toBeDefined();
      expect((mockRuntime as any).unregisterService).toBeDefined();
    });

    it('should work with a minimal runtime object', () => {
      const minimalRuntime = {} as IAgentRuntime;

      expect(() => applyRuntimeExtensions(minimalRuntime)).not.toThrow();
    });
  });

  describe('integration', () => {
    it('should work with all extensions together', async () => {
      applyRuntimeExtensions(mockRuntime);

      // Add components
      const action: Action = { name: 'ACTION1' } as any;
      const provider: Provider = { name: 'PROVIDER1', get: vi.fn() };
      const evaluator: Evaluator = {
        name: 'EVALUATOR1',
        handler: vi.fn(),
        validate: vi.fn(),
      };
      const service = { stop: vi.fn() };
      const eventHandler = vi.fn();

      mockRuntime.actions.push(action);
      mockRuntime.providers.push(provider);
      mockRuntime.evaluators.push(evaluator);
      mockRuntime.services.set('SERVICE1', service);
      mockRuntime.events.set('EVENT1', [eventHandler]);

      // Verify they exist
      expect(mockRuntime.actions).toHaveLength(1);
      expect(mockRuntime.providers).toHaveLength(1);
      expect(mockRuntime.evaluators).toHaveLength(1);
      expect(mockRuntime.services.has('SERVICE1')).toBe(true);
      expect(mockRuntime.events.has('EVENT1')).toBe(true);

      // Remove them
      (mockRuntime as any).unregisterAction('ACTION1');
      (mockRuntime as any).unregisterProvider('PROVIDER1');
      (mockRuntime as any).unregisterEvaluator('EVALUATOR1');
      await (mockRuntime as any).unregisterService('SERVICE1');
      (mockRuntime as any).unregisterEvent('EVENT1', eventHandler);

      // Verify they're gone
      expect(mockRuntime.actions).toHaveLength(0);
      expect(mockRuntime.providers).toHaveLength(0);
      expect(mockRuntime.evaluators).toHaveLength(0);
      expect(mockRuntime.services.has('SERVICE1')).toBe(false);
      expect(mockRuntime.events.has('EVENT1')).toBe(false);
    });
  });
});
