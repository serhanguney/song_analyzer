
## Feature candidates

**Genre control & Granularity.**

Allow the app to be controlled granularly meaning the user can turn on/off some features. For example what is a good approach to turn on Genre control which will require a set of genre definitions and omit anything that does not have the genre value in the metadata. What else can we include in this granularity?

**Better terminal**

Instead asking the user type & enter the decision making steps, we should enable selecting the options with arrow keys and enter. Would it be better to write a separate module (folder) for this ?

**one command to run the app - init [dependent on better terminal]**

IT would list available options to run (all the scripts we have) the user would choose one from available and proceed.

**create .env file [dependent on one command] **

Init command’s first step would be to check if there is an existing .env file, if not then it would run create-credentials script which would ask the user to enter all required credentials found in .env.example file (using better-terminal) and then it would create the .env file

IMPORTANT: this script should only ask credentials for the feautres that are turned on. This means that if the user runs a script after the first iteration which did not have it on, then the app should always ask for the missing credential and update the env file.

run init > ask preferences first > then ask for credentials
Run init > should have different ui for disabled features > disabled features should still be selectable > when selected the app asks for credentials and modifies .env file.

**preferences script**

to allow the user turn on/off granular features