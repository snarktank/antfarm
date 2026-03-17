#!/usr/bin/env node
/**
 * Hello World script that prints the current date and time.
 * Simple utility script for demonstration purposes.
 */

const now = new Date();
const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

console.log(`Hello World! Current date: ${formattedDate}`);
