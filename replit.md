# Overview

MediVault is a comprehensive medical records management platform that allows users to securely store, organize, and track their health information. The application enables users to upload medical documents (lab results, prescriptions, X-rays, etc.), track symptoms over time, and manage their healthcare journey in one centralized location. Built with modern web technologies, it emphasizes security, privacy, and user-friendly design for everyday healthcare management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom medical-themed color variables
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation for type-safe form handling

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth with OpenID Connect integration
- **Session Management**: Express sessions with PostgreSQL session store
- **File Handling**: Multer for file uploads with local storage

## Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon serverless platform
- **File Storage**: Local file system storage for uploaded medical documents
- **Session Storage**: PostgreSQL-based session storage using connect-pg-simple

## Authentication and Authorization
- **Provider**: Replit Auth using OpenID Connect protocol
- **Session Management**: Server-side sessions with PostgreSQL persistence
- **Security**: HTTP-only cookies, CSRF protection, and secure session configuration
- **User Model**: Mandatory user operations for Replit Auth compatibility

## Database Schema Design
- **Users Table**: Core user information with profile data
- **Medical Documents Table**: File metadata, categorization, and organization
- **Symptoms Table**: Symptom tracking with severity, timing, and notes
- **Sessions Table**: Server-side session management (required for Replit Auth)

## File Upload Architecture
- **Validation**: Strict file type validation (PDFs and images only)
- **Size Limits**: 10MB maximum file size per upload
- **Organization**: Automatic categorization by document type and date
- **Security**: Server-side validation and sanitization

## API Design
- **Pattern**: RESTful API endpoints with consistent error handling
- **Validation**: Zod schemas for request/response validation
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Authentication**: Protected routes requiring valid session authentication

# External Dependencies

## Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database hosting
- **@neondatabase/serverless**: WebSocket-based database connection pool

## Authentication Services
- **Replit Auth**: OAuth/OpenID Connect authentication provider
- **openid-client**: OpenID Connect client implementation
- **Passport.js**: Authentication middleware integration

## UI Component Libraries
- **Radix UI**: Comprehensive accessible component primitives
- **shadcn/ui**: Pre-built component library built on Radix UI
- **Lucide React**: Icon library for consistent iconography

## Development Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Type safety across the entire application
- **Tailwind CSS**: Utility-first CSS framework
- **React Query**: Server state management and caching

## File Processing
- **Multer**: Multipart form data handling for file uploads
- **Node.js fs**: File system operations for document storage

## Validation and Forms
- **Zod**: Runtime type validation and schema definition
- **React Hook Form**: Form state management and validation
- **@hookform/resolvers**: Integration between React Hook Form and Zod