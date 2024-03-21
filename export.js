const fs = require('fs');
const { graphql } = require('@octokit/graphql');
const { request } = require('@octokit/request');
const { Octokit } = require("@octokit/rest");
const moment = require('moment');
const envJSON = require('./env.json');
const { env } = require('process');

/**
 * This script exports all issues from a GitHub repository to a CSV file.
 * 
 * Instructions:
 * 1. Create a GitHub personal access token with the "repo" scope.
 *   https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
 * 2. Replace the GITHUB_TOKEN value with your personal access token.
 * 3. Replace the REPO_OWNER and REPO_NAME values with your repository name. Found in the URL of your repository: e.g. https://github.com/REPO_OWNER/REPO_NAME
 * 4. Run the script using Node.js.
 *  npm run start
 * 5. The issues will be exported to a CSV file named "issues.csv".
 * 6. Import the CSV file into your Jira project.
 *  https://support.atlassian.com/jira-software-cloud/docs/import-data-from-csv/
 */

// Assuming you've set your GitHub token, project ID, etc., in env.json
const GITHUB_TOKEN = envJSON.GITHUB_TOKEN;
const PROJECT_ID = envJSON.GITHUB_PROJECT_ID;
const org = envJSON.GITHUB_ORG;

// Instantiate an Octokit client
const octokit = new Octokit({ auth: GITHUB_TOKEN });

const graphqlWithAuth = graphql.defaults({
    headers: {
        authorization: `token ${GITHUB_TOKEN}`,
    },
});

async function fetchProjectIds() {
    const query = `
    query ($org: String!) {
        organization(login: $org) {
          projectsV2(first: 50) {
            edges {
              node {
                id
                title
              }
            }
          }
        }
      }
    `;

    const variables = {
        org,
    };

    try {
        const response = await graphqlWithAuth(query, variables);
        const array = response?.organization?.projectsV2?.edges;
        console.log(`List of all GitHub Project Names and IDs (for organization: ${org}):\n\n${formatProjectList(array)}`);
    } catch (error) {
        console.error("Error fetching project IDs:", error);
    }
}

function formatProjectList(projects) {
    const filteredProjects = projects.filter(project => !project.node.title.toLowerCase().includes('untitled project'));

    const formattedProjects = filteredProjects.map(project => {
        const { id, title } = project.node;
        return `- ${title} (ID: ${id})`;
    });

    return formattedProjects.join('\n');
}

async function fetchIssuesFromProject(afterCursor) {
    const query = `
    query FetchIssues($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $after) {
              pageInfo {
                endCursor
                hasNextPage
              }
              nodes {
                id
                content{
                  ... on DraftIssue {
                    title
                    body
                  }
                  ...on Issue {
                    title
                    body
                    number
                    url
                    labels(first: 20) {
                      nodes {
                        name
                      }
                    }
                  }
                  ...on PullRequest {
                    title
                    body
                    number
                    url
                    labels(first: 20) {
                      nodes {
                        name
                      }
                    }
                  }
                }
                fieldValues(first: 50) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      title
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldMilestoneValue {
                      milestone {
                        title
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldRepositoryValue {
                      repository {
                        name
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldUserValue {
                      users(first: 10) {
                        nodes {
                          login
                        }
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`;

    const variables = {
        projectId: PROJECT_ID,
        after: afterCursor, // Use afterCursor for pagination
    };

    try {
        const response = await graphqlWithAuth(query, variables);
        const items = response.node.items;
        const pageInfo = items.pageInfo;
        const nodes = items.nodes;
        console.log(`Fetched ${nodes.length} issues from project`);

        return {
            pageInfo,
            nodes,
        };
    } catch (error) {
        console.error("Error fetching issues:", error);
        return { pageInfo: {}, nodes: [] };
    }
}


async function main() {
    try {
        let afterCursor = null;
        let allIssues = [];
        let customFieldsSet = new Set();

        while (true) {
            const response = await fetchIssuesFromProject(afterCursor);
            const pageInfo = response.pageInfo;
            const nodes = response.nodes;
            console.log(`Fetched ${nodes.length} issues from project:`, nodes[0].fieldValues.nodes);

            for (const node of nodes) {
                // Add standard fields
                const labels = node.content.labels ? node.content.labels.nodes.map(label => label.name).join(", ") : "";
                const issue = {
                    id: node.id,
                    title: node.content.title,
                    body: node.content.body,
                    number: node.content.number,
                    url: node.content.url,
                    labels
                };
                // Add custom fields
                for (const fieldValue of node.fieldValues.nodes) {
                    const fieldName = fieldValue?.field?.name;
                    if (fieldName) {
                        const fieldValueStr = formatFieldValue(fieldValue);
                        issue[fieldName] = fieldValueStr;
                        customFieldsSet.add(fieldName);
                    }
                }
                allIssues.push(issue);
            }

            if (!pageInfo.hasNextPage) break;
            afterCursor = pageInfo.endCursor;
        }

        // Convert to CSV
        const headers = ["ID", "Title", "Body", "Number", "URL", "Labels", ...customFieldsSet];
        const csvContent = [
            headers.join(","),
            ...allIssues.map(issue => headers.map(header => `"${issue[header] || ""}"`).join(","))
        ].join("\n");

        fs.writeFileSync('project_issues.csv', csvContent);
        console.log(`Exported ${allIssues.length} issues to project_issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

// This function formats the field value based on its type
function formatFieldValue(fieldValue) {
    // Implement logic based on the field type to convert it to a string
    // For example, if it's a user field, concatenate user logins
    if (fieldValue.users) {
        return fieldValue.users.nodes.map(user => user.login).join(", ");
    }
    // Add similar cases for other field types like repository, text, number, etc.
    // For simplicity, this example covers only the user field case
    return "";
}

// Replace 'ownerName' and 'repoName' with actual values
fetchProjectIds('ownerName', 'repoName');

main();