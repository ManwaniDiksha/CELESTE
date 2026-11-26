# Reflection on AI-Assisted Development

One instance where the AI agent got something wrong during the development of CELESTE was in the staff authentication flow. Although the PIN login functionality was implemented, the session was not persisting reliably because of the way the frontend and backend communicated. The browser could drop the authentication cookie due to the cross-origin setup.

I noticed the issue while testing the Reception and Stylist login flows. The login experience was not behaving consistently, which made me realise that implementing authentication was not enough; the session also needed to be maintained correctly after login.

Instead of accepting the implementation as complete, I asked the agent to investigate the authentication and cookie-handling logic. We identified the cross-origin configuration as the underlying issue and corrected the architecture by routing API requests through a same-origin `/api` proxy. This allowed the session cookie to work correctly with the deployed application.

This experience taught me that AI-generated code should always be reviewed and tested rather than accepted without verification. Clear prompts, careful testing, and understanding the problem are essential when using an AI agent to build a working application. I learned that my role was not simply to generate code through prompts, but to make decisions, identify mistakes, and guide the agent towards a reliable solution.
