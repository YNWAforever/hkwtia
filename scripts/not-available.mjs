const [, , command, milestone] = process.argv;

console.error(`${command} becomes available in ${milestone}; M0 has no database.`);
process.exit(1);
