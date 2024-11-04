#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const singleComment = Symbol('singleComment');
const multiComment = Symbol('multiComment');

const stripWithoutWhitespace = () => '';
const stripWithWhitespace = (string, start, end) =>
    string.slice(start, end).replace(/\S/g, ' ');

const isEscaped = (jsonString, quotePosition) => {
    let index = quotePosition - 1;
    let backslashCount = 0;

    while (jsonString[index] === '\\') {
        index -= 1;
        backslashCount += 1;
    }

    return Boolean(backslashCount % 2);
};

function stripJsonComments(
    jsonString,
    { whitespace = true, trailingCommas = false } = {}
) {
    if (typeof jsonString !== 'string') {
        throw new TypeError(
            `Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``
        );
    }

    const strip = whitespace ? stripWithWhitespace : stripWithoutWhitespace;

    let isInsideString = false;
    let isInsideComment = false;
    let offset = 0;
    let buffer = '';
    let result = '';
    let commaIndex = -1;

    for (let index = 0; index < jsonString.length; index++) {
        const currentCharacter = jsonString[index];
        const nextCharacter = jsonString[index + 1];

        if (!isInsideComment && currentCharacter === '"') {
            // Enter or exit string
            const escaped = isEscaped(jsonString, index);
            if (!escaped) {
                isInsideString = !isInsideString;
            }
        }

        if (isInsideString) {
            continue;
        }

        if (!isInsideComment && currentCharacter + nextCharacter === '//') {
            // Enter single-line comment
            buffer += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = singleComment;
            index++;
        } else if (
            isInsideComment === singleComment &&
            currentCharacter + nextCharacter === '\r\n'
        ) {
            // Exit single-line comment via \r\n
            index++;
            isInsideComment = false;
            buffer += strip(jsonString, offset, index);
            offset = index;
            continue;
        } else if (
            isInsideComment === singleComment &&
            currentCharacter === '\n'
        ) {
            // Exit single-line comment via \n
            isInsideComment = false;
            buffer += strip(jsonString, offset, index);
            offset = index;
        } else if (
            !isInsideComment &&
            currentCharacter + nextCharacter === '/*'
        ) {
            // Enter multiline comment
            buffer += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = multiComment;
            index++;
            continue;
        } else if (
            isInsideComment === multiComment &&
            currentCharacter + nextCharacter === '*/'
        ) {
            // Exit multiline comment
            index++;
            isInsideComment = false;
            buffer += strip(jsonString, offset, index + 1);
            offset = index + 1;
            continue;
        } else if (trailingCommas && !isInsideComment) {
            if (commaIndex !== -1) {
                if (currentCharacter === '}' || currentCharacter === ']') {
                    // Strip trailing comma
                    buffer += jsonString.slice(offset, index);
                    result += strip(buffer, 0, 1) + buffer.slice(1);
                    buffer = '';
                    offset = index;
                    commaIndex = -1;
                } else if (
                    currentCharacter !== ' ' &&
                    currentCharacter !== '\t' &&
                    currentCharacter !== '\r' &&
                    currentCharacter !== '\n'
                ) {
                    // Hit non-whitespace following a comma; comma is not trailing
                    buffer += jsonString.slice(offset, index);
                    offset = index;
                    commaIndex = -1;
                }
            } else if (currentCharacter === ',') {
                // Flush buffer prior to this point, and save new comma index
                result += buffer + jsonString.slice(offset, index);
                buffer = '';
                offset = index;
                commaIndex = index;
            }
        }
    }

    return (
        result +
        buffer +
        (isInsideComment
            ? strip(jsonString.slice(offset))
            : jsonString.slice(offset))
    );
}
const writeJsonFile = (filePath, content) => {
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
};

// Step 1: Initialize a new npm project
console.log('Initializing npm project...');
execSync('npm init -y', { stdio: 'inherit' });

// Step 2: Install dependencies
console.log('Installing dependencies...');
execSync('npm install --save-dev typescript nodemon ts-node rimraf prettier', {
    stdio: 'inherit',
});

// Step 3: Initialize TypeScript configuration
console.log('Initializing TypeScript configuration...');
execSync('npx tsc --init', { stdio: 'inherit' });

// Step 4: Modify tsconfig.json for rootDir and outDir
console.log('Configuring tsconfig.json...');
const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
const tsconfig = JSON.parse(stripJsonComments(tsconfigContent));
tsconfig.compilerOptions = {
    ...tsconfig.compilerOptions,
    rootDir: './src',
    outDir: './dist',
};
writeJsonFile(tsconfigPath, tsconfig);

// Step 5: Create directory structure
console.log('Creating directory structure...');
fs.mkdirSync('src', { recursive: true });
fs.writeFileSync('src/index.ts', "console.log('hello world');");

// Step 6: Modify package.json to add scripts
console.log('Configuring package.json...');
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
packageJson.scripts = {
    ...packageJson.scripts,
    dev: 'nodemon src/index.ts',
    build: 'npm run clean && tsc',
    start: 'node dist/index.js',
    clean: 'rimraf dist',
    'prettier:write': 'prettier --write "src/**/*.ts"',
    'prettier:check': 'prettier --check "src/**/*.ts"',
};
writeJsonFile(packageJsonPath, packageJson);

const prettierRcPath = path.join(process.cwd(), '.prettierrc');
const prettierRc = {
    "arrowParens": "avoid",
    "bracketSpacing": true,
    "htmlWhitespaceSensitivity": "css",
    "insertPragma": false,
    "printWidth": 120,
    "proseWrap": "always",
    "quoteProps": "as-needed",
    "requirePragma": false,
    "semi": true,
    "singleQuote": true,
    "tabWidth": 2,
    "trailingComma": "all",
    "useTabs": false
};
writeJsonFile(prettierRcPath, prettierRc);
const prettierIgnore = `
tsconfig.json
dist
node_modules
package.json
package-lock.json
.github
`;
fs.writeFileSync('.prettierignore', prettierIgnore)
execSync('npm run prettier:write', { stdio: 'inherit' });

console.log("Setup complete! You can now run 'npm run dev' to start development.");
