# MatchScheduler

MatchScheduler is a web application designed to eliminate the headache of scheduling matches for gaming teams. Instead of endless back-and-forth on Discord, this tool provides a simple, visual way for teams to compare availability and find the perfect time to play.

## The Problem

Coordinating a group of players to find a common time for a match is time-consuming and often chaotic. Trying to manage this across multiple teams using chat applications like Discord leads to missed messages, confusion, and frustration.

## The Solution 

This tool provides a centralized platform where:

- Players can set their availability on a simple weekly grid.
- Team leaders can instantly see a combined view of their team's schedule.
- Anyone can compare their team's availability against any other team to find overlapping free times.

The goal is not to be a full-fledged tournament platform, but to do one thing perfectly: **make it incredibly easy to find out when a match can happen.**

## Core Features

- **Visual Availability Grid:** Set and view availability for 2 weeks at a glance.
- **Team Management:** Create a team, invite players with a simple code, and manage your roster.
- **Availability Comparison:** The key feature! Select an opponent (or multiple) and instantly see all the time slots where both teams have enough players to start a match.
- **Discord & Google Login:** Simple and secure authentication for easy onboarding.

## Tech Stack

- **Backend:** Firebase (Firestore, Cloud Functions, Authentication)
- **Frontend:** HTML, CSS, & JavaScript