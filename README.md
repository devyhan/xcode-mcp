# xcode-mcp

An MCP (Model Context Protocol) server that provides tools for Xcode-related operations, making it easier to work with Xcode projects from MCP clients like Claude Desktop.

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

#### 1. xcode-project-info

Retrieves information about an Xcode project.

**Parameters**:
- `projectPath` (required): Path to the Xcode project or workspace

**Example**:
```
Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
```

#### 2. xcode-build

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

### Example Scenario: Using with LLMs

Below is an example of how you might prompt an LLM like Claude to use these tools in sequence:

**User Prompt to Claude:**
```
I need to inspect my Xcode project and then build it.

1. First, use the xcode-project-info tool to get information about my project at /Users/username/Projects/MyApp/MyApp.xcodeproj
2. After you see the project info, identify the available schemes from the output.
3. Then use the xcode-build tool to build my project with the first available scheme, using the Debug configuration and targeting the iOS Simulator.
```

**Expected Workflow:**
1. Claude will execute the `xcode-project-info` tool to retrieve the project information
2. Claude will analyze the output to identify available schemes
3. Claude will then use the `xcode-build` tool with parameters filled from the information it discovered:
   ```
   Project path: /Users/username/Projects/MyApp/MyApp.xcodeproj
   Scheme: [First scheme from project info]
   Configuration: Debug
   Destination: platform=iOS Simulator,name=iPhone 14
   ```

This workflow demonstrates how to chain multiple tools together, using the output from one tool to inform the parameters for another.

## Security Considerations

This tool can execute Xcode-related commands, which poses security risks. Please note:

- Only use with trusted Xcode projects.
- Be cautious with projects from unknown sources.
- Do not include sensitive information in build parameters.

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

MIT
