import type { Action, IAgentRuntime, State, Memory } from '@elizaos/core';
import { PluginManagerService } from '../services/pluginManagerService';

export const installPluginFromRegistryAction: Action = {
  name: 'installPluginFromRegistry',
  description: 'Install a plugin from the ElizaOS plugin registry',
  similes: [
    'install plugin from registry',
    'add plugin from registry',
    'download plugin',
    'get plugin from registry',
  ],

  async handler(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
    const pluginManagerService = runtime.getService('PLUGIN_MANAGER') as PluginManagerService;

    if (!pluginManagerService) {
      return 'Plugin manager service not available';
    }

    // Extract plugin name from message content
    const content = message.content.text.toLowerCase();
    let pluginNameMatch = null;
    let pluginName = null;

    // Try different patterns to extract plugin name
    // Pattern 1: install [plugin] from registry <name>
    pluginNameMatch = content.match(/install\s+(?:plugin\s+)?from\s+registry\s+([^\s]+)/i);
    if (pluginNameMatch) {
      pluginName = pluginNameMatch[1];
    }

    // Pattern 2: install [plugin] <name> [from registry]
    if (!pluginName) {
      pluginNameMatch = content.match(/install\s+(?:plugin\s+)?([^\s]+?)(?:\s+from\s+registry)?$/i);
      if (pluginNameMatch && pluginNameMatch[1] !== 'from') {
        pluginName = pluginNameMatch[1];
      }
    }

    // Pattern 3: add/download/get plugin <name>
    if (!pluginName) {
      pluginNameMatch = content.match(/(?:add|download|get)\s+(?:plugin\s+)?([^\s]+)/i);
      if (pluginNameMatch) {
        pluginName = pluginNameMatch[1];
      }
    }

    if (!pluginName) {
      return 'Please specify a plugin name to install. Example: "install plugin @elizaos/plugin-example"';
    }

    try {
      const pluginInfo = await pluginManagerService.installPluginFromRegistry(pluginName);

      if (pluginInfo.status === 'needs_configuration') {
        return (
          `Plugin ${pluginInfo.name} has been installed but requires configuration:\n` +
          pluginInfo.requiredEnvVars
            .map((v) => `- ${v.name}: ${v.description}${v.sensitive ? ' (sensitive)' : ''}`)
            .join('\n') +
          '\n\nUse "configure plugin" to set up the required environment variables.'
        );
      }

      return (
        `Successfully installed plugin ${pluginInfo.name} v${pluginInfo.version}. ` +
        `Use "load plugin ${pluginName}" to activate it.`
      );
    } catch (error: any) {
      return `Failed to install plugin: ${error.message}`;
    }
  },

  validate: async (runtime: IAgentRuntime) => {
    const pluginManagerService = runtime.getService('PLUGIN_MANAGER');
    return !!pluginManagerService;
  },
};
