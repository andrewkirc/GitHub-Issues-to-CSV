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
                    createdAt
                    updatedAt
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
            console.log(`Fetched ${nodes.length} issues from project...`, nodes[0]);

            for (const node of nodes) {
                // Add standard fields
                const labels = node.content.labels ? node.content.labels.nodes.map(label => label.name).join(", ") : "";
                const issue = {
                    Number: node.content.number?.toString() || "", // Ensure number is a string and add fallback
                    Title: node.content.title, // Added Title field assuming you want to include it
                    Body: node.content.body,
                    URL: node.content.url,
                    Labels: labels,
                    Created: moment(node.content.createdAt).format("YYYY-MM-DD"),
                    Updated: moment(node.content.updatedAt).format("YYYY-MM-DD"),
                };
                // Add custom fields
                for (const fieldValue of node.fieldValues.nodes) {
                    const fieldName = fieldValue?.field?.name;
                    if (fieldName) {
                        const fieldValueStr = fieldValue;
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
        // Assuming 'allIssues' is an array of issue objects and 'customFieldsSet' contains all unique field names
        const headers = ["Number", "Title", "Body", "URL", "Labels", "Created", "Updated", ...customFieldsSet];

        // Initialize CSV content with headers
        let csvContent = [headers.join(",")];

        // Iterate over all issues to create CSV rows
        allIssues.forEach(issue => {
            // Create an array to hold the values for this issue, in the order of the headers
            let row = headers.map(header => {
                // For each header, extract the corresponding value from the issue
                // If the issue does not have a value for this header, use an empty string
                const formattedHeader = formatFieldValue(issue[header] || "");
                return formattedHeader;
            });
            // Join the row's values into a single CSV-formatted string and add it to the content
            csvContent.push(row.join(","));
        });

        // Join all rows into the final CSV content
        csvContent = csvContent.join("\n");

        // Write the CSV content to a file
        fs.writeFileSync('project_issues.csv', csvContent);
        console.log(`Exported ${allIssues.length} issues to project_issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

// This function formats the fields before adding them to the CSV
function formatFieldValue(value) {
    if (value === null || value === undefined) return "";

    // Convert various value objects to strings for CSV
    if (value.text) value = value.text; //Text column
    if (value.number) value = `${value.number}`; //Number column
    if (value.date) value = moment(value.date).format("YYYY-MM-DD"); //Date column
    if (value.users?.nodes) value = value.users.nodes.map(user => user.login).join(", "); //User column
    if (value.repository?.name) value = value.repository.name; //Repository column
    if (value.milestone?.title) value = value.milestone.title; //Milestone column
    if (value.name) value = value.name; //Status column

    // Ensure value is converted to a string to safely use .replace()
    if (typeof value !== 'string') {
        if (Array.isArray(value)) {
            // Join array elements with a comma for CSV, and ensure each element is a string
            value = value.map(element => element.toString()).join(", ");
        } else if (typeof value === 'object') {
            // Convert objects to a string representation
            value = JSON.stringify(value, null, 2);
        } else {
            // Convert any other type to string
            value = value.toString();
        }
    }

    // Convert value to string to handle .replace()
    value = value.toString();

    // Removing characters outside of the desired Unicode range
    value = value.replace(/[^\x00-\x7F]/g, '');

    // Removing emojis using regex
    value = value.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}]/gu, '');

    // Escaping special characters
    value = value.replace(/"/g, '""'); // Escape quotes

    if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
        value = `"${value}"`; // Enclose in quotes if value contains commas, newlines, or quotes
    }
    return value;
}

// Replace 'ownerName' and 'repoName' with actual values
fetchProjectIds('ownerName', 'repoName');

main();