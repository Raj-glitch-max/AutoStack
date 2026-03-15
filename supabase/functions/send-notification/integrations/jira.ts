// Jira Cloud REST API v3 Integration
// Auto-creates Jira issues for AIRE incidents and COIE findings

export interface JiraConfig {
  base_url: string; // e.g., https://mycompany.atlassian.net
  email: string;
  api_token_vault_id: string; // Stored in Vault
  project_key: string; // e.g., 'OPS'
  custom_field_id?: string; // For storing AutoStack incident ID
}

export interface JiraIssue {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: any; // Atlassian Document Format
    priority: { name: string };
    labels: string[];
    [key: string]: any; // For custom fields
  };
}

export async function createJiraIssue(
  config: JiraConfig,
  event: any,
  apiToken: string
): Promise<{ success: boolean; error?: string; issue_key?: string }> {
  try {
    const { type, data } = event;

    // Check if issue already exists (deduplication)
    if (data.jira_issue_key) {
      return { success: true, issue_key: data.jira_issue_key };
    }

    const issue = mapEventToJiraIssue(config, type, data);
    if (!issue) {
      return { success: true }; // Event not configured for Jira
    }

    const auth = btoa(`${config.email}:${apiToken}`);
    const response = await fetch(`${config.base_url}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(issue)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return { success: true, issue_key: result.key };
  } catch (error: any) {
    console.error('[Jira] Create issue failed:', error);
    return { success: false, error: error.message };
  }
}

function mapEventToJiraIssue(config: JiraConfig, type: string, data: any): JiraIssue | null {
  if (type === 'incident.detected') {
    const issue: JiraIssue = {
      fields: {
        project: { key: config.project_key },
        issuetype: { name: 'Bug' },
        summary: `[AutoStack] ${data.pattern}: ${data.title}`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Incident detected by AutoStack AIRE', marks: [{ type: 'strong' }] }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Severity: ${data.severity}` }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Root Cause: ${data.root_cause}` }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Immediate Action: ${data.immediate_action}` }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'View in AutoStack: ' },
                {
                  type: 'text',
                  text: `https://autostack.io/incidents/${data.id}`,
                  marks: [{ type: 'link', attrs: { href: `https://autostack.io/incidents/${data.id}` } }]
                }
              ]
            }
          ]
        },
        priority: { name: mapPriority(data.severity) },
        labels: ['autostack', 'auto-created', 'incident']
      }
    };

    // Add custom field for AutoStack incident ID
    if (config.custom_field_id) {
      issue.fields[config.custom_field_id] = data.id;
    }

    return issue;
  }

  if (type === 'finding.opened' && data.severity === 'critical') {
    const issue: JiraIssue = {
      fields: {
        project: { key: config.project_key },
        issuetype: { name: 'Task' },
        summary: `[AutoStack COIE] ${data.title}`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Cost optimization opportunity detected', marks: [{ type: 'strong' }] }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Potential Savings: $${data.potential_savings}/month` }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Recommendation: ${data.recommendation}` }
              ]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'View in AutoStack: ' },
                {
                  type: 'text',
                  text: `https://autostack.io/cost/${data.id}`,
                  marks: [{ type: 'link', attrs: { href: `https://autostack.io/cost/${data.id}` } }]
                }
              ]
            }
          ]
        },
        priority: { name: 'Medium' },
        labels: ['autostack', 'auto-created', 'cost-optimization']
      }
    };

    if (config.custom_field_id) {
      issue.fields[config.custom_field_id] = data.id;
    }

    return issue;
  }

  return null;
}

function mapPriority(severity: string): string {
  switch (severity) {
    case 'critical': return 'Critical';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    default: return 'Low';
  }
}

export async function testJiraConnection(
  config: JiraConfig,
  apiToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = btoa(`${config.email}:${apiToken}`);
    
    // Test by fetching project info
    const response = await fetch(`${config.base_url}/rest/api/3/project/${config.project_key}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Jira API error: ${response.status} - ${errorText}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const jiraModule = {
  name: 'jira',
  send: createJiraIssue,
  test: testJiraConnection,
  configSchema: {
    base_url: { type: 'string', required: true },
    email: { type: 'string', required: true },
    api_token_vault_id: { type: 'string', required: true, sensitive: true },
    project_key: { type: 'string', required: true },
    custom_field_id: { type: 'string', required: false }
  }
};
