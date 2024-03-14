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
          projectsV2(first: 10) {
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
    query ($projectId: ID!, $after: String) {
        node(id: $projectId) {
            ... on ProjectV2 {
                items(first: 100, after: $after) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    nodes {
                        id
                        content {
                            ... on Issue {
                                title
                                body
                                state
                                createdAt
                                updatedAt
                                url
                                labels(first: 10) {
                                    nodes {
                                        name
                                    }
                                }
                                projectNextItems(first: 5) {
                                    nodes {
                                        field {
                                            name
                                        }
                                        value
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
        after: afterCursor
    };

    const response = await request('POST /graphql', {
        headers: {
            authorization: `token ${GITHUB_TOKEN}`,
        },
        query,
        variables
    });
    console.log(response.data);

    return response.data.data.node.items;
}

async function main() {
    try {
        let afterCursor = null;
        let allIssues = [];

        while (true) {
            const { pageInfo, nodes } = await fetchIssuesFromProject(afterCursor);
            // You'll need to extract the relevant issue details from nodes here
            // This might require additional logic to navigate the nested structure
            // and handle the custom fields appropriately.
            allIssues = allIssues.concat(nodes);
            if (!pageInfo.hasNextPage) break;
            afterCursor = pageInfo.endCursor;
        }

        const csvFile = fs.createWriteStream('project_issues.csv');
        // Update header to include custom fields as needed
        csvFile.write('"Key","Summary","Description","Date Created","Date Modified","Status","Labels","HTML URL","Custom Fields..."\n');

        // Processing logic here would need to be adjusted to match the structure of project issues
        // and to correctly extract and format custom fields.

        console.log(`Exported ${allIssues.length} issues to project_issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

// Replace 'ownerName' and 'repoName' with actual values
fetchProjectIds('ownerName', 'repoName');

//main();