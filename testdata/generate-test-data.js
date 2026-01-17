#!/usr/bin/env node

/**
 * Generate SQL INSERT statements from a DDL file
 * Usage: node generate-test-data.js <ddl-file> <num-rows> [output-file]
 * Example: node generate-test-data.js testable_ddl.sql 100 testable_data.sql
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node generate-test-data.js <ddl-file> <num-rows> [output-file]');
  console.error('Example: node generate-test-data.js testable_ddl.sql 100 testable_data.sql');
  process.exit(1);
}

const ddlFile = args[0];
const numRows = parseInt(args[1], 10);
const outputFile = args[2] || ddlFile.replace('_ddl.sql', '_data.sql').replace('.sql', '_data.sql');

if (isNaN(numRows) || numRows <= 0) {
  console.error('Error: Number of rows must be a positive integer');
  process.exit(1);
}

// Read DDL file
let ddlContent;
try {
  ddlContent = fs.readFileSync(ddlFile, 'utf-8');
} catch (err) {
  console.error(`Error reading file ${ddlFile}:`, err.message);
  process.exit(1);
}

// Parse CREATE TABLE statement
const createTableRegex = /CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]+?)\);?/i;
const match = ddlContent.match(createTableRegex);

if (!match) {
  console.error('Error: Could not find CREATE TABLE statement in DDL file');
  process.exit(1);
}

const tableName = match[1];
const columnsSection = match[2];

// Parse columns
const columnRegex = /"?(\w+)"?\s+(\w+)(?:\s+PRIMARY KEY)?(?:\s+NOT NULL)?/gi;
const columns = [];
let columnMatch;

while ((columnMatch = columnRegex.exec(columnsSection)) !== null) {
  columns.push({
    name: columnMatch[1],
    type: columnMatch[2].toUpperCase()
  });
}

if (columns.length === 0) {
  console.error('Error: Could not parse columns from DDL file');
  process.exit(1);
}

console.log(`Generating ${numRows} rows for table "${tableName}" with columns:`, columns.map(c => `${c.name} (${c.type})`).join(', '));

// Data generators for different types
const generators = {
  INTEGER: (index) => index + 1,
  TEXT: (index, columnName) => {
    const words = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    return `'${columnName}_${words[index % words.length]}_${index}'`;
  },
  REAL: (index) => (Math.random() * 1000).toFixed(2),
  NUMERIC: (index) => (Math.random() * 1000).toFixed(2),
  BLOB: (index) => `X'${Buffer.from(`blob_data_${index}`).toString('hex')}'`
};

// Generate INSERT statements
const inserts = [];
for (let i = 0; i < numRows; i++) {
  const values = columns.map((col, colIndex) => {
    const generator = generators[col.type] || generators.TEXT;
    return generator(i, col.name);
  });
  
  inserts.push(`INSERT INTO "${tableName}" (${columns.map(c => `"${c.name}"`).join(', ')}) VALUES (${values.join(', ')});`);
}

// Create output content
const output = `-- Test data for table "${tableName}"
-- Generated on ${new Date().toISOString()}
-- Number of rows: ${numRows}

${inserts.join('\n')}
`;

// Write to output file
const outputPath = path.join(path.dirname(ddlFile), path.basename(outputFile));
try {
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`✓ Successfully generated ${numRows} rows`);
  console.log(`✓ Output written to: ${outputPath}`);
} catch (err) {
  console.error(`Error writing to file ${outputPath}:`, err.message);
  process.exit(1);
}
