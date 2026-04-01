#!/usr/bin/env node

/**
 * PreToolUse Hook: Security audit for tool calls
 *
 * Scans tool inputs for:
 * - Hardcoded secrets (API keys, tokens, passwords)
 * - Dangerous command patterns (piped bash, shell injection)
 * - Sensitive file access attempts
 *
 * This is an audit-only hook (exits 0) - it warns but does not block.
 */

'use strict';

const MAX_STDIN = 1024 * 1024; // 1MB limit

// Secret patterns to detect
const SECRET_PATTERNS = [
  /sk[-_]proj[_-]?[a-zA-Z0-9]{20,}/i,  // OpenAI API keys
  /sk[-_]?(ant[h]?ropic|claude)[_-]?[a-zA-Z0-9]{20,}/i,  // Anthropic API keys
  /ghp_[a-zA-Z0-9]{36}/i,  // GitHub personal access tokens
  /gho_[a-zA-Z0-9]{36}/i,  // GitHub OAuth
  /glpat-[a-zA-Z0-9]{20,}/i,  // GitLab personal access tokens
  /AKIA[A-Z0-9]{16}/i,  // AWS access key ID
  /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40,}(?![A-Za-z0-9/+=])/,  // Generic long base64
  /password\s*[=:]\s*['"][^'"]{8,}['"]/i,
  /api[_-]?key\s*[=:]\s*['"][^'"]{8,}['"]/i,
  /secret[_-]?key\s*[=:]\s*['"][^'"]{8,}['"]/i,
  /token\s*[=:]\s*['"][^'"]{8,}['"]/i,
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/i,
  /Authorization:\s*Bearer\s+/i,
];

// Dangerous patterns to detect
const DANGEROUS_PATTERNS = [
  /\|\s*bash/i,
  /\|\s*sh\b/i,
  /\bcurl\s+.*?\s*\|\s*bash/i,
  /\bwget\s+.*?\s*\|\s*bash/i,
  /\brsync\s+.*?\s*--delete/i,
  /\.\/\|/,
  /\$\([^)]*\)|`[^`]+`/,  // Command substitution
  /;\s*rm\s+/i,
  /;\s*dd\s+/i,
  /shred\s+/i,
];

// Sensitive paths
const SENSITIVE_PATHS = [
  /~/.ssh\//,
  /\.ssh\//,
  /~\/\.aws\//,
  /\.aws\//,
  /~\/\.kube\//,
  /\.kube\//,
  /~\/\.gcp\//,
  /\.gcp\//,
  /\.env$/,
  /\.env\./,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
];

function log(msg) {
  process.stderr.write(`[security-audit] ${msg}\n`);
}

function detectSecrets(input) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(input)) {
      findings.push(`secret pattern detected: ${pattern}`);
    }
  }
  return findings;
}

function detectDangerousPatterns(input) {
  const findings = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      findings.push(`dangerous pattern: ${pattern}`);
    }
  }
  return findings;
}

function detectSensitivePaths(input) {
  const findings = [];
  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.test(input)) {
      findings.push(`sensitive path access: ${pattern}`);
    }
  }
  return findings;
}

function auditToolCall(toolName, input) {
  const issues = [];

  if (toolName === 'Bash' || toolName === 'Write' || toolName === 'Edit') {
    issues.push(...detectSecrets(input));
    issues.push(...detectDangerousPatterns(input));
  }

  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Glob') {
    issues.push(...detectSensitivePaths(input));
  }

  return issues;
}

let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    // Parse the input - it's JSON with tool call info
    let parsed = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON, pass through
      process.stdout.write(data);
      process.exit(0);
      return;
    }

    const toolName = parsed.tool;
    const input = JSON.stringify(parsed.input || {});

    const issues = auditToolCall(toolName, input);

    if (issues.length > 0) {
      log(`Security audit warnings for ${toolName}:`);
      for (const issue of issues) {
        log(`  - ${issue}`);
      }
      log('Review recommended before proceeding');
    }
  } catch (err) {
    log(`audit error: ${err.message}`);
  }

  // Always pass through - audit only, no blocking
  process.stdout.write(data);
  process.exit(0);
});
