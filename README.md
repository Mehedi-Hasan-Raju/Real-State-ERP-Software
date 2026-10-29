
 #RealState ERP — Backend

A secure and scalable REST API for managing real estate development operations, including projects, buildings, apartments, bookings, installments, payments, employees, and financial reporting.

## Overview

EstateFlow ERP is a backend application designed for real estate developers to manage their business operations from a centralized system.

The backend follows a modular architecture with separate routes, controllers, services, and validation schemas. It uses PostgreSQL for data storage and Prisma ORM for database access.

### Key Features

- Authentication and role-based authorization
- Organization-level data isolation
- Employee management
- Real estate project management
- Building and property management
- Booking and booking status management
- Installment scheduling and tracking
- Payment collection and tracking
- Financial summaries and customer ledgers
- Request validation using Zod
- Audit logs and activity history
- Pagination, filtering, searching, and sorting
- Centralized error handling
- RESTful API architecture

> Note: The availability of each feature depends on the current backend implementation and configured API routes.

## Technology Stack

| Technology    | Purpose                                |
| ------------- | -------------------------------------- |
| Node.js       | JavaScript runtime                     |
| Express.js    | REST API framework                     |
| TypeScript    | Type-safe application development      |
| PostgreSQL    | Relational database                    |
| Prisma ORM    | Database queries and schema management |
| Zod           | Request validation                     |
| Cookie Parser | Reading authentication cookies         |
| CORS          | Cross-origin request configuration     |
| TSX           | TypeScript development runtime         |

## Project Structure

The backend uses a modular structure. A typical module may contain the following files:

```text
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── generated/
│   │   └── prisma/
│   ├── lib/
│   │   └── prisma.ts
│   ├── middlewares/
│   ├── modules/
│   │   ├── auth/
│   │   ├── employees/
│   │   ├── projects/
│   │   ├── bookings/
│   │   ├── installments/
│   │   ├── payments/
│   │   └── ...
│   ├── app.ts
│   └── server.ts
├── .env
├── .env.example
├── .gitignore
├── package.json
├── prisma.config.ts
├── tsconfig.json
└── README.md
```

The exact modules and filenames may vary as development progresses.

### Module Architecture

Each business module can separate its responsibilities into different files:

- **Routes:** Define API endpoints and middleware.
- **Controllers:** Handle HTTP requests and responses.
- **Services:** Implement business rules and database operations.
- **Validation:** Define request schemas using Zod.
- **Types:** Define reusable TypeScript types when needed.

This separation makes the code easier to test, maintain, and extend.

## Prerequisites

Install the following before running the application:

- Node.js (a version compatible with the installed dependencies)
- npm
- PostgreSQL database or a compatible managed PostgreSQL service
- Postman for API testing
- Git (recommended)

## Installation

### 1. Clone the repository

```bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
cd backend
```

Replace the repository URL with your actual backend repository URL.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the backend root directory.

Example:

```env
PORT=5000
DATABASE_URL="YOUR_POSTGRESQL_CONNECTION_STRING"
FRONTEND_URL="http://localhost:3000"
```

Use the actual variable names required by your `src` configuration and `prisma.config.ts`. If authentication, cookies, or other modules require additional environment variables, configure those as well.

**Security:** Never commit `.env` files, database credentials, session secrets, or production keys to Git.

### 4. Configure Prisma

Make sure the database connection is configured correctly and that the Prisma schema matches the target database.

Review the available package scripts:

```bash
npm run
```

Run the appropriate migration command defined by your project configuration. For example, if the project uses Prisma migrations:

```bash
npx prisma migrate dev --name init
```

Use `init` only for the initial migration. For subsequent schema changes, use a descriptive migration name.

If your project has an existing migration history, do not create a new initial migration unnecessarily. In production, use the deployment migration workflow configured for the project.

### 5. Generate the Prisma Client

If your Prisma configuration requires an explicit client-generation step, run the configured generation command:

```bash
npx prisma generate
```

Confirm that the generated client location matches the import path used by the application.

### 6. Start the development server

```bash
npm run dev
```

The development API is expected to run at:

```text
http://localhost:5000
```

Check the health endpoint:

```http
GET /api/v1/health
```

A successful response indicates that the API process is responding. Database connectivity should also be checked separately if the health endpoint does not verify it.

## Environment Variables

| Variable       | Description                     |
| -------------- | ------------------------------- |
| `PORT`         | Port used by the Express server |
| `DATABASE_URL` | PostgreSQL connection string    |
| `FRONTEND_URL` | Frontend origin allowed by CORS |

Additional variables may be required by the current authentication and deployment configuration.

## Authentication and Authorization

EstateFlow ERP uses authentication middleware to protect private endpoints. The application is configured to support cookie-based authentication.

The authenticated user context should provide the information needed for authorization, including:

- User ID
- Organization ID
- Role

### Role-Based Access Control

The application defines roles such as:

| Role           | Intended responsibility                           |
| -------------- | ------------------------------------------------- |
| `OWNER`        | Organization ownership and administrative control |
| `ADMIN`        | Administrative operations                         |
| `MANAGER`      | Management operations                             |
| `SALES`        | Sales and booking operations                      |
| `ACCOUNTANT`   | Financial operations                              |
| `CONSTRUCTION` | Construction-related operations                   |
| `VIEWER`       | Read-only access where permitted                  |

Actual access depends on the authorization rules implemented for each endpoint.

### Cookie-Based Authentication

For protected requests:

1. Authenticate using the configured login endpoint.
2. Preserve the authentication cookie returned by the server.
3. Send the cookie with subsequent requests.
4. Confirm that the user's role and organization permit the requested action.

When using the frontend, credentialed requests should use `credentials: "include"` where required.

## Request Validation

Zod is used to validate incoming request data before it reaches business logic.

For example, a booking creation schema can validate:

- Booking code
- Customer and unit IDs
- Agreed price
- Booking amount
- Booking date
- Optional notes

Business constraints can also be expressed through Zod refinements. For example, the initial booking amount must not exceed the agreed price.

Validation should be applied to the appropriate request sections, such as the request body, query parameters, and route parameters.

**Important:** Validation does not replace database checks or authorization. The service layer must still verify resource ownership, relationships, permissions, and business rules.

## Core Business Modules

### 1. Authentication

Responsible for user authentication, session handling, and access to protected resources.

### 2. Employees

Manages organization employees and their assigned roles, subject to the authorization rules of the application.

### 3. Projects

Manages real estate development projects, including project details, status, budget, and related resources as implemented.

Project-related requests should verify organization ownership and access permissions.

### 4. Buildings and Properties

Supports the management of buildings and associated property resources, such as floors and units, where implemented.

A resource ID must not be treated as proof of ownership. The backend must verify that the requested resource belongs to the authorized organization and relevant project.

### 5. Bookings

Manages customer bookings, booking amounts, agreed prices, booking dates, and status transitions.

Booking operations should verify customer and unit relationships and enforce booking business rules.

### 6. Installments

Manages installment schedules, due dates, installment amounts, payment status, and cancellation restrictions.

Installment creation should enforce the relevant booking constraints and prevent invalid duplicate installment numbers.

### 7. Payments

Records payments against installments and updates the corresponding payment status.

Payment operations should validate the payment amount, payment method, installment balance, and booking eligibility.

### 8. Finance Reports

Provides financial summaries and customer-level financial information where the corresponding endpoints are implemented.

Examples of reporting metrics include:

- Total agreed amount
- Lifetime collections
- Collections during a selected period
- Outstanding balances
- Overdue installment counts and balances
- Customer ledger information

Financial reports should be derived from actual database records rather than hardcoded values.

### 9. Notifications and Audit Logs

Notifications can inform users about relevant events when notification persistence and event triggers are implemented.

Audit logs are intended to record important actions, including the actor, timestamp, entity, action, and relevant previous and updated values.

## API Conventions

The API uses a versioned base path:

```text
/api/v1
```

The exact endpoints should be verified against the registered Express routes.

Known endpoint groups include:

| Module           | Example endpoints                                          |
| ---------------- | ---------------------------------------------------------- |
| Health           | `GET /api/v1/health`                                       |
| Installments     | `GET /api/v1/installments`                                 |
| Payments         | `GET /api/v1/payments`                                     |
| Finance reports  | `GET /api/v1/finance-reports/summary`                      |
| Customer reports | `GET /api/v1/finance-reports/customers`                    |
| Customer ledger  | `GET /api/v1/finance-reports/customers/:customerId/ledger` |

The examples above assume that the corresponding routers are mounted under `/api/v1`.

### Pagination and Filtering

List endpoints may support query parameters such as:

```text
?page=1&limit=10
```

Depending on the module, additional filters may include search terms, status, project, customer, date range, and sorting options.

Always check the module's validation schema for the supported query parameters and allowed values.

### HTTP Status Codes

Common HTTP status codes include:

| Code  | Meaning                            |
| ----- | ---------------------------------- |
| `200` | Request successful                 |
| `201` | Resource created                   |
| `400` | Invalid request                    |
| `401` | Authentication required            |
| `403` | Permission denied                  |
| `404` | Resource not found                 |
| `409` | Business rule or resource conflict |
| `500` | Unexpected server error            |

The exact status code depends on the endpoint and error-handling implementation.

## Data Isolation and Security

Organization-level data isolation is essential because multiple organizations may use the same application.

The backend should enforce the following safeguards:

- Derive the authenticated organization from trusted server-side authentication context.
- Verify organization ownership when reading or modifying projects and related resources.
- Check ownership of buildings, floors, units, documents, customers, bookings, and installments where applicable.
- Verify employee project assignments before allowing restricted project operations.
- Prevent users from accessing resources by guessing IDs from another organization.
- Enforce role permissions on the server, not only in the frontend.
- Use database constraints and transactions where appropriate.
- Avoid exposing sensitive information in error responses and logs.

Returning `403 Forbidden` or `404 Not Found` for unauthorized resource access should follow a consistent security policy.

## Audit Logging

Important business operations should be recorded in audit logs.

Recommended audit fields include:

- Organization ID
- Actor or user ID
- Entity type
- Entity ID
- Action
- Previous values
- Updated values
- Timestamp

For operations requiring audit history, the business update and audit record should be written within the same database transaction where appropriate. This helps prevent a successful update from being recorded without its corresponding audit entry, or vice versa.

## Error Handling

The service layer can throw structured errors containing an error message and HTTP status code.

Controllers or centralized error-handling middleware should convert these errors into consistent HTTP responses.

Avoid returning database internals, stack traces, secrets, or connection details to clients in production.

## Testing with Postman

Use Postman to test the API before integrating new frontend features.

Recommended workflow:

1. Start the backend server.
2. Check the health endpoint.
3. Authenticate and preserve the session cookie.
4. Create or retrieve the required organization resources.
5. Test successful requests.
6. Test missing and invalid fields.
7. Test unauthorized roles.
8. Test resource IDs belonging to another organization.
9. Test invalid state transitions and business-rule violations.
10. Verify that the database reflects the expected changes.

For example, to retrieve installments:

```http
GET http://localhost:5000/api/v1/installments?page=1&limit=10
```

To retrieve payments:

```http
GET http://localhost:5000/api/v1/payments?page=1&limit=10
```

To retrieve the finance summary:

```http
GET http://localhost:5000/api/v1/finance-reports/summary
```

These requests require authentication if the corresponding routes are protected.

## Development Guidelines

When adding a new module:

1. Define or update the Prisma models if necessary.
2. Create Zod validation schemas.
3. Implement business logic in the service layer.
4. Implement request handling in the controller.
5. Register the module's routes and middleware.
6. Enforce authentication, authorization, and organization isolation.
7. Add audit logging for important state-changing actions.
8. Test success and failure cases using Postman.
9. Update this README with confirmed endpoints and configuration changes.

## Performance and Reliability

The backend should prioritize:

- Database indexes for frequently queried fields
- Pagination for large collections
- Efficient Prisma queries and selective field retrieval
- Transactions for related database updates
- Input validation and appropriate query limits
- Graceful server shutdown
- Safe handling of database connection failures
- Structured logging and production error handling

Performance improvements should be verified with realistic data and measurements.

## Production Deployment Checklist

Before deployment:

- [x] Configure production environment variables.
- [ ] Use a secure PostgreSQL connection.
- [ ] Apply database migrations through the production workflow.
- [ ] Verify cookie security and CORS settings.
- [ ] Enforce authorization and organization isolation.
- [ ] Review database constraints and indexes.
- [ ] Configure HTTPS.
- [ ] Add suitable logging and monitoring.
- [ ] Verify backup and recovery procedures.
- [ ] Test critical booking and payment workflows.
- [ ] Remove development-only settings and secrets.


