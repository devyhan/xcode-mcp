# @devyhan/xcode-mcp

An MCP (Model Context Protocol) server that allows you to execute shell commands from MCP clients, with special tools for Xcode-related operations.

## Installation

```bash
npm install @devyhan/xcode-mcp
```

## Usage

### Using with Claude Desktop

1. Open Claude Desktop config file:
   ```bash
   # macOS
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Add or modify the following configuration:
   ```json
   {
     "mcpServers": {
       "xcode-mcp": {
         "command": "npx",
         "args": [
           "@devyhan/xcode-mcp",
           "-y"
         ]
       }
     }
   }
   ```

3. Restart Claude Desktop.

### Available Tools

#### 1. execute-shell

Executes shell commands and returns the results.

**Parameters**:
- `command` (required): The shell command to execute
- `workingDir` (optional): Working directory where the command will be executed
- `timeout` (optional): Command execution timeout in milliseconds, default: 60000ms

**Example**:
```
Command: ls -la
```

#### 2. xcode-project-info

Retrieves information about an Xcode project.

**Parameters**:
- `projectPath` (required): Path to the Xcode project or workspace

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
```

#### 3. xcode-build

Builds an Xcode project.

**Parameters**:
- `projectPath` (required): Path to the Xcode project or workspace
- `scheme` (required): The scheme to build
- `configuration` (optional): Build configuration (e.g., Debug, Release)
- `destination` (optional): Build destination (e.g., 'platform=iOS Simulator,name=iPhone 14')

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
Scheme: MyAppScheme
Configuration: Debug
Destination: platform=iOS Simulator,name=iPhone 14
```

## Security Considerations

This tool can execute shell commands, which poses security risks. Please note:

- Only execute commands you trust.
- Commands that could damage your system (`rm -rf /`, `mkfs`, etc.) are blocked for security reasons.
- Do not execute commands containing sensitive information.

## Development

### Requirements

- Node.js 16 or higher
- npm 6 or higher

### Local Development and Testing

```bash
# Clone the repository
git clone https://github.com/devyhan/xcode-mcp.git
cd xcode-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Test
npm test
```

## License

ISC
