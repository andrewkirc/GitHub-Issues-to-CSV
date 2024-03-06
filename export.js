const fs = require('fs');
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
        // Fetch all issues in the repository
        const issues = [];
        await octokit.paginate(
            octokit.issues.listForRepo,
            {
                owner: REPO_OWNER,
                repo: REPO_NAME,
                state: 'all',
                per_page: 100
            },
            (response) => {
                console.log("Fetched:", response.data.length)
                issues.push(...response.data);
            }
        );
        console.log("Total Issues:", issues.length)
        console.log("Preview 1st Issue:", issues[0])

        // Create a new CSV file
        console.log("Starting to write to CSV file, this may take a while...");
        const csvFile = fs.createWriteStream('issues.csv');

        // Write the CSV file header
        csvFile.write('"Key","Summary","Description","Date Created","Date Modified","Status","Labels","HTML URL"\n');

        // Write the issues to the CSV file
        for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            // Fetch the labels for the issue
            const { data: labels } = await octokit.issues.listLabelsOnIssue({
                owner: REPO_OWNER,
                repo: REPO_NAME,
                issue_number: issue.number
            });

            // Convert the labels to a CSV string
            const labelsCsv = labels.map(label => `"${label.name.replace(/\s/g, '-')}"`).join(',');

            // Replace null values with empty strings
            const title = issue.title ? issue.title : '';
            const body = issue.body ? `${issue.body} View original GitHub issue with comments: ${issue.html_url}` : `View original GitHub issue with comments: ${issue.html_url}`;

            // Format the created and updated dates using the moment library
            const createdDate = moment(issue.created_at).format("DD/MMM/YY HH:mm");
            const updatedDate = moment(issue.updated_at).format("DD/MMM/YY HH:mm");

            csvFile.write(`"${issue.id}","${title.replace(/"/g, '""')}","${body.replace(/"/g, '""')}"," ${createdDate}"," ${updatedDate}","${issue.state}",${labelsCsv},${issue.html_url}\n`);

            // Log the progress of the for loop
            console.log(`Processed ${i + 1} of ${issues.length} issues`);
        }

        console.log(`Exported ${issues.length} issues to issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

main();