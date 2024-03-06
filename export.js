const fs = require('fs');
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

// REQUIRED: Replace with your GitHub personal access token
const GITHUB_TOKEN = envJSON.GITHUB_TOKEN;

// REQUIRED: Replace with the owner and repository name
const REPO_OWNER = envJSON.REPO_OWNER;
const REPO_NAME = envJSON.REPO_NAME;

// Instantiate an Octokit client
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function main() {
    try {
        const query = `
        query ($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                issues(first: 50000) {
                    nodes {
                        id
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
                    }
                }
            }
        }`;

        const variables = {
            owner: REPO_OWNER,
            name: REPO_NAME
        };

        const response = await request('POST /graphql', {
            headers: {
                authorization: `token ${GITHUB_TOKEN}`,
            },
            query,
            variables
        });

        const issues = response.data.data.repository.issues.nodes;

        const csvFile = fs.createWriteStream('issues.csv');
        csvFile.write('"Key","Summary","Description","Date Created","Date Modified","Status","Labels","HTML URL"\n');

        for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            const labelsCsv = issue.labels.nodes.map(label => `"${label.name.replace(/\s/g, '-')}"`).join(',');
            const title = issue.title ? issue.title : '';
            const body = issue.body ? `${issue.body} View original GitHub issue with comments: ${issue.url}` : `View original GitHub issue with comments: ${issue.url}`;
            const createdDate = moment(issue.createdAt).format("DD/MMM/YY HH:mm");
            const updatedDate = moment(issue.updatedAt).format("DD/MMM/YY HH:mm");

            csvFile.write(`"${issue.id}","${title.replace(/"/g, '""')}","${body.replace(/"/g, '""')}"," ${createdDate}"," ${updatedDate}","${issue.state}",${labelsCsv},${issue.url}\n`);
            console.log(`Processed ${i + 1} of ${issues.length} issues`);
        }

        console.log(`Exported ${issues.length} issues to issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

main();