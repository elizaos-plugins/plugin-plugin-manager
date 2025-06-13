import { IAgentRuntime, Plugin } from '@elizaos/core';
import { LpManagementAgentAction } from './actions/LpManagementAgentAction.ts';
import { realTokenTestsSuite } from './e2e/real-token-tests.ts';
import { lpManagerScenariosSuite } from './e2e/scenarios.ts';
import { DexInteractionService } from './services/DexInteractionService.ts';
import { UserLpProfileService } from './services/UserLpProfileService.ts';
import { VaultService } from './services/VaultService.ts';
import { YieldOptimizationService } from './services/YieldOptimizationService.ts';
import { LpAutoRebalanceTask } from './tasks/LpAutoRebalanceTask.ts';

// It's good practice to define a unique name for the plugin
export const LP_MANAGER_PLUGIN_NAME = '@elizaos/plugin-lp-manager';

const lpManagerPlugin: Plugin = {
  name: LP_MANAGER_PLUGIN_NAME,
  description: 'Manages Liquidity Pool (LP) positions on Solana DEXs.',
  actions: [LpManagementAgentAction],
  services: [VaultService, UserLpProfileService, DexInteractionService, YieldOptimizationService],
  // Include DEX plugins as dependencies
  dependencies: ['@elizaos/plugin-raydium', '@elizaos/plugin-orca', '@elizaos/plugin-meteora'],
  tests: [lpManagerScenariosSuite, realTokenTestsSuite],

  init: async (config: Record<string, string>, runtime: IAgentRuntime): Promise<void> => {
    console.info(`Plugin ${LP_MANAGER_PLUGIN_NAME} initialized.`);

    // Always try to load real DEX plugins first
    try {
      const dexPlugins = [
        '@elizaos/plugin-raydium',
        '@elizaos/plugin-orca',
        '@elizaos/plugin-meteora',
      ];
      let loadedAny = false;

      for (const pluginName of dexPlugins) {
        try {
          const plugin = await import(pluginName);
          if (plugin.default && typeof plugin.default.init === 'function') {
            console.info(`Initializing DEX plugin: ${pluginName}`);
            await plugin.default.init(config, runtime);
            loadedAny = true;
          }
        } catch (err) {
          console.warn(`Failed to load DEX plugin ${pluginName}:`, err);
        }
      }

      // Set up a delayed check for DEX services
      setTimeout(async () => {
        const dexService = runtime.getService<any>('dex-interaction');
        if (dexService && typeof dexService.getLpServices === 'function') {
          const lpServices = dexService.getLpServices();
          if (lpServices.length === 0) {
            console.info(
              'No real DEX services found after initialization, registering mock services'
            );
            const { registerMockDexServices } = await import('./services/MockLpService.ts');
            await registerMockDexServices(runtime);
          }
        }
      }, 3000);
    } catch (error) {
      console.warn('Error loading DEX plugins:', error);
    }
  },
};

export default lpManagerPlugin;

// We export the classes and action object for external use if needed,
// though they are primarily loaded by the runtime through the plugin definition.
export {
  DexInteractionService,
  LpAutoRebalanceTask,
  LpManagementAgentAction,
  UserLpProfileService,
  VaultService,
  YieldOptimizationService,
};
