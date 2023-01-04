const fs = require('fs');
const { Octokit } = require("@octokit/rest");
const moment = require('moment');

// Replace with your GitHub personal access token
const GITHUB_TOKEN = '';

// Replace with the owner and repository name
const REPO_OWNER = '';
const REPO_NAME = '';

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
        const csvFile = fs.createWriteStream('issues.csv');

        // Write the CSV file header
        csvFile.write('"Key","Summary","Description","Date Created","Date Modified","Status","Labels"\n');

        // Write the issues to the CSV file
        for (const issue of issues) {
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
            const body = issue.body ? issue.body : '';

            // Format the created and updated dates using the moment library
            const createdDate = moment(issue.created_at).format('DD/MMM/YY h:mm a');
            const updatedDate = moment(issue.updated_at).format('DD/MMM/YY h:mm a');

            csvFile.write(`"${issue.id}","${title.replace(/"/g, '""')}","${body.replace(/"/g, '""')}","${createdDate}","${updatedDate}","${issue.state}",${labelsCsv}\n`);
        }

        console.log(`Exported ${issues.length} issues to issues.csv`);
    } catch (error) {
        console.error(error);
    }
}

main();