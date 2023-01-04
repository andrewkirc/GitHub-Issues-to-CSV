# GitHub-Issues-to-CSV
A Node.js script that exports all issues from a private GitHub repository to a Jira compatible CSV file.

To use this script, you will need to install Node.js (v16+) and npm on your computer. You can then clone the repository and install the required dependencies by running the following commands:

```
git clone https://github.com/your_username/GitHub-to-JIRA-Issue-Exporter.git

cd GitHub-to-JIRA-Issue-Exporter

npm install
```

Next, you will need to create a personal access token for your GitHub account. This token will be used to authenticate the script with the GitHub API. To create a personal access token, follow these steps:

1. Go to your [GitHub Developer Settings](https://github.com/settings/tokens).
2. Click the "Generate new token (classic)" button.
3. Enter a name for the token, such as "GitHub-to-JIRA-Issue-Exporter".
4. Select the "repo" scope.
5. Click the "Generate token" button.
6. Copy the generated token and paste it into the `GITHUB_TOKEN` variable in the script.

Then, modify the `REPO_OWNER` and `REPO_NAME` variables to specify the owner and name of the repository from which you want to export the issues.

Finally, you can run the script by using the following command:

```
node export.js
```

This will create a CSV file called `issues.csv` in the current directory, containing all the issues in the specified repository, along with their labels, created and updated dates, and descriptions. The CSV file will be in a format that is compatible with Jira.

You can then import the CSV file into Jira by following these steps:
https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/#Importing-your-CSV-file

This should import all the issues from the CSV file into Jira.
