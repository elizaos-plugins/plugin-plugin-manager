import { IAgentRuntime } from '@elizaos/core';

/**
 * Core Runtime Extensions
 *
 * This module provides extensions to the core runtime for plugin management.
 * Since we cannot modify the core runtime directly, we extend it with additional
 * methods needed for proper plugin lifecycle management.
 */

/**
 * Extends the runtime with an unregisterEvent method
 * This allows plugins to remove their event handlers when unloaded
 */
export function extendRuntimeWithEventUnregistration(runtime: IAgentRuntime): void {
  // Add unregisterEvent method if it doesn't exist
  if (!(runtime as any).unregisterEvent) {
    (runtime as any).unregisterEvent = function (
      event: string,
      handler: (params: any) => Promise<void>
    ) {
      const handlers = this.events.get(event);
      if (handlers) {
        const filteredHandlers = handlers.filter((h) => h !== handler);
        if (filteredHandlers.length > 0) {
          this.events.set(event, filteredHandlers);
        } else {
          this.events.delete(event);
        }
      }
    };
  }
}

/**
 * Extends the runtime with component unregistration methods
 * These are needed for proper plugin unloading
 */
export function extendRuntimeWithComponentUnregistration(runtime: IAgentRuntime): void {
  // Add unregisterAction method if it doesn't exist
  if (!(runtime as any).unregisterAction) {
    (runtime as any).unregisterAction = function (actionName: string) {
      const index = this.actions.findIndex((a) => a.name === actionName);
      if (index !== -1) {
        this.actions.splice(index, 1);
      }
    };
  }

  // Add unregisterProvider method if it doesn't exist
  if (!(runtime as any).unregisterProvider) {
    (runtime as any).unregisterProvider = function (providerName: string) {
      const index = this.providers.findIndex((p) => p.name === providerName);
      if (index !== -1) {
        this.providers.splice(index, 1);
      }
    };
  }

  // Add unregisterEvaluator method if it doesn't exist
  if (!(runtime as any).unregisterEvaluator) {
    (runtime as any).unregisterEvaluator = function (evaluatorName: string) {
      const index = this.evaluators.findIndex((e) => e.name === evaluatorName);
      if (index !== -1) {
        this.evaluators.splice(index, 1);
      }
    };
  }

  // Add unregisterService method if it doesn't exist
  if (!(runtime as any).unregisterService) {
    (runtime as any).unregisterService = async function (serviceType: string) {
      const service = this.services.get(serviceType);
      if (service) {
        try {
          await service.stop();
        } catch (error) {
          console.error(`Error stopping service ${serviceType}:`, error);
        }
        this.services.delete(serviceType);
      }
    };
  }
}

/**
 * Apply all runtime extensions
 */
export function applyRuntimeExtensions(runtime: IAgentRuntime): void {
  extendRuntimeWithEventUnregistration(runtime);
  extendRuntimeWithComponentUnregistration(runtime);
}
