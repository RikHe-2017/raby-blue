/// <reference types="chrome"/>

declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | object | null): Promise<{ [key: string]: any }>;
      set(items: object): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    const sync: StorageArea;
    const local: StorageArea;
  }

  namespace declarativeNetRequest {
    type RuleActionType = 'block' | 'redirect' | 'allow' | 'upgradeScheme' | 'modifyHeaders' | 'allowAllRequests';
    type ResourceType = 'main_frame' | 'sub_frame' | 'stylesheet' | 'script' | 'image' | 'font' | 'object' | 'xmlhttprequest' | 'ping' | 'csp_report' | 'media' | 'websocket' | 'other';

    interface Rule {
      id: number;
      priority?: number;
      action: {
        type: RuleActionType;
        redirect?: {
          url: string;
        };
      };
      condition: {
        urlFilter?: string;
        regexFilter?: string;
        resourceTypes?: ResourceType[];
        tabIds?: number[];
      };
    }

    interface UpdateDynamicRulesOptions {
      addRules?: Rule[];
      removeRuleIds?: number[];
    }

    function updateDynamicRules(options: UpdateDynamicRulesOptions): Promise<void>;
    function getDynamicRules(): Promise<Rule[]>;
    function updateSessionRules(options: UpdateRuleOptions): Promise<void>;
    function getSessionRules(): Promise<Rule[]>;
  }
}
