# A Beginner's Guide to CI and GitHub Actions

## 1. What is CI (Continuous Integration)?

Imagine you are baking a cake with a team of 5 people. If everyone brings their customized ingredients and mixes them all at the very end, there is a high chance the cake will taste terrible because the ingredients might conflict.

In software development, **Continuous Integration (CI)** is the process of mixing the ingredients (code) frequently—often multiple times a day. Every time a developer adds code, an automated system checks if the new code:
1. Compiles or builds correctly.
2. Doesn't break the existing features.
3. Passes automated tests. 

**Why do we need it?**
- **Catches bugs early:** Finding a bug immediately after making a change is much easier to fix than finding it weeks later.
- **Removes the "It works on my machine" excuse:** The code is tested on an independent server, ensuring it works universally.
- **Saves time:** Developers don't have to manually run tests and builds every time they share code.

---

## 2. What is GitHub Actions?

GitHub Actions is an automation tool built directly into GitHub. It acts as a robot assistant. You give this robot a set of instructions (a **Workflow**), and tell it *when* to execute them (e.g., "whenever someone pushes code"). 

When the trigger happens, GitHub spins up a fresh, clean computer in the cloud (called a **Runner**), downloads your code onto it, and runs the steps you defined.

---

## 3. Key Concepts of GitHub Actions

Here is the vocabulary you need to know:

- **Workflow:** The entire automated process. It is written down in a `.yml` file inside the `.github/workflows/` directory of your project.
- **Events:** The "trigger" that starts the workflow. Examples: `push`ing code, opening a `pull_request`, or even a scheduled timer.
- **Runner:** The computer (virtual machine) that GitHub provides to run your workflow. It usually runs Linux (Ubuntu), Windows, or macOS.
- **Jobs:** A workflow is made of one or more Jobs. A Job is a group of tasks that run on the *same* Runner. 
- **Steps:** The individual tasks inside a Job that execute sequentially. For example: Step 1 could be "Install Node.js" and Step 2 could be "Run `npm install`".
- **Actions:** Pre-written, reusable steps that other developers have created. Instead of writing 20 lines of code to install Node.js, you can just use an "Action" that does it for you in one line.

---

## 4. Let's look at the pipeline we just built!

We created a file at `[ci.yml](file:///c:/Users/91901/OneDrive/Desktop/practice2/.github/workflows/ci.yml)`. 

Here is what the file says, translated into plain English:

1. **`on: push`**: Hey GitHub, anytime someone pushes their code up to the `main` or `master` branch...
2. **`runs-on: ubuntu-latest`**: ...please start up an Ubuntu Linux machine for me.
3. **`uses: actions/checkout@v4`**: (Step 1) Download my code from GitHub onto this Ubuntu machine.
4. **`uses: actions/setup-node@v4`**: (Step 2) Install Node.js version 20 on the machine so I can run my JavaScript app.
5. **`run: echo ...`**: (Step 3) Print a welcome message in the terminal.
6. **`run: npm install`**: (Step 4) Go into the `user-service` folder and install all the necessary packages for it to run.

### Next Steps...

If you had automated tests in your `user-service` (like Jest, Mocha, etc.), the very next step in the pipeline would be to run them using `npm test`. If the tests fail, GitHub will mark the pipeline with a big Red X ❌ (meaning the code broke something). If everything works, it gets a Green Checkmark ✅.
