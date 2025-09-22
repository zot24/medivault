# Overview

MediVault is an AI-powered healthcare intelligence platform that transforms how users understand and manage their health information. The application uses artificial intelligence to analyze medical documents, track symptoms, and provide personalized health insights based on each user's complete health profile. By connecting patterns across lab results, prescriptions, symptoms, and treatments, MediVault delivers actionable health recommendations and helps users make more informed decisions about their care. Built with cutting-edge AI technology and modern web frameworks, it emphasizes intelligent analysis, security, privacy, and personalized healthcare insights.

# User Preferences

Preferred communication style: Simple, everyday language.
Marketing Focus: AI-powered health insights and personalized recommendations.
Target Audience: Health-conscious individuals seeking intelligent analysis of their medical data.

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

# Marketing Positioning

MediVault positions itself as the first AI-powered personal health intelligence platform that:
- Analyzes patterns across all medical data (documents, symptoms, treatments)
- Provides personalized health insights and recommendations
- Connects dots between symptoms, treatments, and outcomes
- Helps users make more informed healthcare decisions
- Delivers intelligent summaries for doctor visits
- Offers predictive health planning and optimization

## Key Value Propositions
- **AI Health Analysis**: Intelligent pattern recognition across all health data
- **Personalized Insights**: Customized recommendations based on individual health profiles
- **Smart Document Processing**: Automatic extraction of key information from medical documents
- **Symptom Intelligence**: AI-powered connections between symptoms and treatments
- **Predictive Health Planning**: Proactive recommendations for optimal health management
- **Privacy-First AI**: All analysis happens securely with user data remaining private