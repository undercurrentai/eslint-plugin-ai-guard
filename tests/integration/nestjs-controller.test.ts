import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import aiGuard from '../../src/index';

describe('integration: nestjs controller', () => {
  it('reports require-framework-auth on unguarded methods but not on methods with UseGuards', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser,
            parserOptions: {
              sourceType: 'module',
              experimentalDecorators: true,
            },
          },
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            ...aiGuard.configs.recommended.rules,
          },
        },
      ],
      ignore: false,
    });

    const code = `
      import { Controller, Get, Post, UseGuards } from '@nestjs/common';

      @Controller('users')
      class UsersController {
        @Get()
        findAll() { return []; }

        @Post()
        create() { return {}; }

        @UseGuards(AuthGuard)
        @Get(':id')
        findOne() { return {}; }
      }
    `;

    const [result] = await eslint.lintText(code, { filePath: 'users.controller.ts' });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    // findAll and create lack @UseGuards, so they should fire
    const reportedMethods = authMessages.map((m) => m.message);
    expect(reportedMethods.some((msg) => msg.includes('findAll'))).toBe(true);
    expect(reportedMethods.some((msg) => msg.includes('create'))).toBe(true);

    // findOne has @UseGuards(AuthGuard), so it should NOT fire
    expect(reportedMethods.some((msg) => msg.includes('findOne'))).toBe(false);
  });

  it('does not report when class-level UseGuards is present', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser,
            parserOptions: {
              sourceType: 'module',
              experimentalDecorators: true,
            },
          },
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            'ai-guard/require-framework-auth': 'error',
          },
        },
      ],
      ignore: false,
    });

    const code = `
      import { Controller, Get, Post, UseGuards } from '@nestjs/common';

      @UseGuards(AuthGuard)
      @Controller('admin')
      class AdminController {
        @Get()
        list() { return []; }

        @Post()
        create() { return {}; }
      }
    `;

    const [result] = await eslint.lintText(code, { filePath: 'admin.controller.ts' });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    expect(authMessages).toHaveLength(0);
  });
});
