# Server Setup Guide

## Database Structure System

This project uses JSON files to define database table structures. Tables are automatically created from JSON schema files.

### Adding New Tables

1. Create a new JSON file in `server/database/structure/systemtables/`
2. Follow this format:

```json
{
  "TableName": "YourTableName",
  "PrimaryKeyFields": "Id",
  "Fields": [
    {
      "FieldName": "Id",
      "DataType": "int",
      "NotNullable": true,
      "AutoIncrement": true
    },
    {
      "FieldName": "YourField",
      "DataType": "varchar(100)",
      "NotNullable": true,
      "Unique": false,
      "DefaultValue": "default_value"
    }
  ]
}
```

### Available Field Properties

- `FieldName`: Name of the column
- `DataType`: MySQL data type (int, varchar(n), text, timestamp, boolean, etc.)
- `NotNullable`: true/false - whether field can be NULL
- `AutoIncrement`: true/false - auto-increment for primary keys
- `Unique`: true/false - adds unique constraint
- `DefaultValue`: Default value for the field

### Authentication Endpoints

**Register User**
```
POST /api/auth/register
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Login**
```
POST /api/auth/login
{
  "username": "john_doe",
  "password": "securePassword123"
}
```

Returns JWT token for authenticated requests.

**Using Protected Routes**
```
Authorization: Bearer <your-jwt-token>
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure your database in `.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=projectmanagement
JWT_SECRET=your-secret-key
```

3. Create the MySQL database:
```sql
CREATE DATABASE projectmanagement;
```

4. Run the server:
```bash
npm run dev
```

The server will automatically create all tables defined in the JSON schema files on startup.
