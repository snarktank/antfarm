/**
 * Easter egg: `antfarm ant` prints ASCII art and a random quote.
 */

const ANT_ART = `
       \\     /
        \\   /
         \\ /
     .---'o'---.
    /   /   \\   \\
   '---'     '---'
     |  \\ /  |
     |   V   |
     (___A___)
`;

const QUOTES: readonly string[] = [
  "No ant is an island. — adapted from John Donne",
  "Alone we can do so little; together we can do so much. — Helen Keller",
  "Great things are done by a series of small things brought together. — Van Gogh",
  "The productivity of a work group seems to depend on how the group members see their own goals in relation to the goals of the organization. — Ken Blanchard",
  "If you want to go fast, go alone. If you want to go far, go together. — African Proverb",
  "Ants can carry 50 times their own body weight. What's your excuse?",
  "Teamwork makes the dream work, but a vision becomes a nightmare when the leader has a big dream and a bad team. — John Maxwell",
  "What is an ant colony but a distributed system with excellent uptime?",
  "The world is moved along not only by the mighty shoves of its heroes, but also by the tiny pushes of each honest worker. — Helen Keller",
  "An ant on the move does more than a dozing ox. — Lao Tzu",
];

export function printAnt(): void {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  process.stdout.write(`${ANT_ART}\n${quote}\n`);
}
