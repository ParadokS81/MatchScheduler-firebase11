# About Me & My AI Workflow

This document provides personal context to help AI assistants collaborate with me effectively.

## My Background
> I am a self-taught developer with a background in computer gaming. My strengths are in creative thinking and thinking conceptually about ideas and user stories, but I am still learning the intricacies of vibe coding and project management. I value learning and improving my development process.

## How I Work with AI
> I use Gemini for high-level strategy, analysis, and prompt engineering. I use Cursor/Sonnet for direct code generation. I expect the AI to be a collaborative partner that helps me think, not just a code monkey. The goal is for us to build a robust, maintainable project together. I NEVER prefer the quick fix, patch, or work around. I dont mind letting the project take one step back, if it means we have to refactor a bit to take 2 bigger steps forward later. I sometimes end up in technical debt, but its not voulentarily. Its mostly because of a lack of knowledge and experience.

## Known Quirks & Preferences
> - I prefer clear, well-commented code that explains the "why".
> - I sometimes get stuck on details and need the AI to help me see the bigger picture.
> - I value honesty; if the AI is confused or doesn't have enough context, it should say so.
> - I appreciate when the AI can explain complex topics in simple terms.
> - I prefer the AI explain proposed feature or implementation conceptually, before making a long implementation plan. My deeper understanding of what the AI wants to build, might give me new perspective and pivot or adjust. So its wasted time to make a huge plan of action before I really understand what you want to build, based on my ideas.

## My Development Journey & Learning Style
> - **Iterative Learner:** I've built MatchScheduler 3 times (Google Sheets → Web API → Firebase), learning and improving with each iteration.
> - **Pattern Recognition:** I notice when things "feel wrong" (like when fixing one bug creates two more) - this usually means there's an architectural issue.
> - **Future-Thinking:** I plan for features we'll want later (like event sourcing for analytics) even if they're not immediate needs.
> - **Quality Over Speed:** I'd rather rebuild properly than accumulate technical debt. Each rebuild has taught me valuable lessons.
> - **Practical Awareness:** I track things like context window usage and recognize when we need to handover or document decisions.

## Working Pace & Communication
> - **Thoughtful Pauses:** I like to stop and think before moving forward ("I'm a little slower than you"). This helps me fully understand before implementing.
> - **Trust but Verify:** When AI says I'm "on the right track," it reassures me and helps me continue confidently.
> - **Conceptual First:** I need to understand the "why" and the overall approach before diving into implementation details.
> - **Direct Feedback:** I appreciate when AI acknowledges what we've accomplished and clearly outlines next steps.

## Project Context (MatchScheduler)
> - **Community Scale:** Building for ~300 players, 30-40 teams - a small, tight-knit gaming community.
> - **Use Case:** Teams have overlapping rosters (clan teams + draft tournaments), need efficient scheduling.
> - **Architecture Philosophy:** Don't over-engineer for our scale. Enterprise patterns for 300 players is overkill.
> - **UI Pride:** I've spent significant time perfecting certain UI elements (like the team management drawer). I value preserving polished work.

## The Gemini-Cursor-Git Workflow
Our standard process is as follows:
1.  **Onboarding:** The AI reads the `README.md` in this folder to get the current project status and priorities.
2.  **Task Definition:** A high-level goal is set from the Kanban board.
3.  **Live Code Analysis:** The AI reads the current, relevant files from the local system.
4.  **Implementation/Prompting:** We collaborate on the implementation. If using another AI for generation, Gemini helps craft the detailed prompt.
5.  **Git Review:** The code is committed with a clear, conventional commit message. Gemini may be asked to review the changes using `git diff` to confirm success.
