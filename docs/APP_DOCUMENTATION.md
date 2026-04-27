# FrontBill - Comprehensive Application Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Application Overview](#application-overview)
3. [System Architecture](#system-architecture)
4. [Core Features](#core-features)
5. [Technical Stack](#technical-stack)
6. [Database Schema](#database-schema)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Financial Management](#financial-management)
9. [Key Modules](#key-modules)
10. [UI/UX Components](#uiux-components)

---

## Executive Summary

**FrontBill** is a comprehensive **Cloud-Based Hotel Management SaaS (Software-as-a-Service) Platform** designed to streamline operations for hotels, guest houses, and hospitality businesses in Africa and beyond. The application provides end-to-end management of bookings, reservations, room inventory, guest profiles, payments, financial reporting, and operational analytics through an intuitive web-based dashboard.

Built with modern web technologies (Next.js 16, React 19, Supabase, TypeScript), FrontBill enables hoteliers to efficiently manage their properties with real-time data, automated financial tracking, and actionable insights through AI-powered analytics.

---

## Application Overview

### What is FrontBill?

FrontBill is a **multi-tenant hotel management system** where:
- Each hotel/organization operates independently with isolated data
- Staff members are assigned roles and permissions to access specific features
- All financial transactions, room bookings, and guest data are tracked in real-time
- Real-time occupancy, revenue, and performance analytics are available on demand
- Integration with multiple payment methods (Cash, POS, Bank Transfer, City Ledger/Credit)

### Key Business Problem It Solves

1. **Manual Booking Management** - Replaces paper-based or spreadsheet booking systems
2. **Payment Tracking** - Automates receipt tracking and balance management
3. **Room Inventory** - Real-time room availability and occupancy status
4. **Guest Database** - Centralized guest profiles with check-in history
5. **Financial Reporting** - Automated daily revenue reports and analytics
6. **Outstanding Balances** - Tracks unpaid folios (city ledger) for credit accounts
7. **Operational Efficiency** - Night audit automation and daily reconciliation

### Target Users

- **Hotel Managers** - Full system access for operations management
- **Receptionists** - Create bookings, check-in guests, process payments
- **Accountants** - View financial reports, reconciliation, and audit trails
- **Admin Staff** - System configuration, user management, room setup
- **Owners** - Dashboard overview, analytics, and performance tracking

---

## System Architecture

### Technology Stack

#### Frontend
- **Next.js 16** - React framework with App Router for server-side rendering
- **React 19.2** - UI library with latest hooks and features
- **TypeScript 5.7** - Type-safe development
- **Tailwind CSS 3.4** - Utility-first styling framework
- **Shadcn/UI** - High-quality component library
- **Recharts 2.15** - Data visualization and charts
- **React Hook Form** - Efficient form management
- **Zod** - Runtime type validation

#### Backend & Database
- **Supabase** - PostgreSQL database with real-time subscriptions
- **PostgREST** - Auto-generated REST API from database schema
- **Row-Level Security (RLS)** - Data isolation per organization

#### Authentication & Security
- **Supabase Auth** - Email/password authentication with JWT tokens
- **Session Persistence** - Cross-tab session synchronization via localStorage
- **Middleware Authorization** - Protected routes and API endpoints
- **RLS Policies** - Database-level data access control

#### Infrastructure
- **Vercel** - Deployment platform with automatic CI/CD
- **Edge Functions** - Serverless computation at edge
- **PostgreSQL** - Relational database for structured data

---

## Core Features

### 1. Dashboard & Analytics

#### Main Dashboard
- **Real-time KPIs**: Total Revenue, Occupancy Rate, Active Bookings, Guest Count
- **Room Status Grid**: Visual representation of room availability (Available, Occupied, Maintenance, Reserved)
- **Revenue Chart**: Daily/weekly/monthly revenue trends across payment methods
- **Recent Payments**: List of latest transactions with payment methods
- **Quick Actions**: Fast access to create bookings, add charges, extend stays

#### Analytics Module
- **Multi-period Analysis**: Today, 7 days, 30 days, current month, custom range
- **Revenue by Payment Method**: Cash, POS, Bank Transfer, City Ledger breakdown
- **Payment Trends**: Line charts showing revenue patterns over time
- **Occupancy Analysis**: Room utilization rates and capacity planning
- **City Ledger Aging**: Outstanding balance tracking by account
- **Export Functionality**: Generate PDF reports for management

### 2. Booking Management

#### New Bookings
- **Guest Selection**: Choose from existing guests or create new
- **Room Selection**: View available rooms filtered by check-in/check-out dates
- **Date-based Filtering**: Automatically hide rooms with existing bookings
- **Rate Calculation**: Auto-calculate total based on number of nights and rate per night
- **Deposit Collection**: Track deposits and remaining balance
- **Payment Method Selection**: Cash, POS, Bank Transfer, City Ledger
- **Folio Generation**: Auto-generate unique folio IDs for reference

#### Booking Actions
- **Extend Stay**: Add additional nights with dynamic rate calculation
- **Add Charges**: Miscellaneous charges (laundry, room service, extras)
- **Record Payments**: Partial or full payment recording
- **View Booking Details**: Full booking history, payment status, charges
- **Cancel Booking**: Remove bookings and free up rooms

#### Booking Status Tracking
- **Payment Status**: Pending, Partial, Paid
- **Booking Status**: Active, Checked-in, Checked-out, Cancelled
- **Balance Tracking**: Unpaid amount calculated from folio charges

### 3. Reservation Management

#### Reservations
- **Future Bookings**: Track reservations not yet checked in
- **Reservation Status**: View upcoming arrivals and their details
- **Payment Collection**: Collect deposits or full payments at reservation
- **City Ledger Support**: Allow reservations on credit accounts

#### Reservation Features
- **Check-in**: Convert reservation to active booking
- **Payment Options**: Flexible payment methods with partial payment support
- **Auto-calculation**: Room rates and total amounts calculated automatically

### 4. Room Management

#### Room Setup & Inventory
- **Room Creation**: Add rooms with type, floor, capacity, amenities
- **Room Types**: Standard, Deluxe, Suite, etc. with different pricing
- **Room Status**: Available, Occupied, Maintenance, Reserved
- **Amenities Tagging**: Tag rooms with amenities (WiFi, AC, TV, etc.)
- **Rate Configuration**: Set per-night rates per room or room type

#### Real-time Occupancy
- **Availability View**: Color-coded room grid showing status
- **Occupancy Rate**: Percentage of occupied rooms
- **Capacity Planning**: Track max occupancy vs current guests
- **Room Detail Pages**: Individual room history and booking logs

### 5. Guest Database

#### Comprehensive Guest Profiles
- **Guest Information**: Name, phone, email, ID type, ID number
- **Contact Details**: Address, city, country, date of birth
- **Notes**: Special requests, preferences, allergies
- **Check-in History**: All previous bookings and stays
- **Outstanding Balance**: Unpaid charges across all bookings
- **Contact Preferences**: Preferred communication method

#### Guest Functions
- **Create Guest**: Add new guest with full profile
- **Edit Guest**: Update information as needed
- **View Booking History**: See all past and current bookings
- **Track Balance**: Monitor outstanding payments
- **Full-page Details**: Comprehensive guest overview with charts

### 6. Payment & Financial Management

#### Payment Recording
- **Payment Methods**: Cash, POS, Bank Transfer, City Ledger
- **Partial Payments**: Record partial payments against booking balance
- **Payment Reference**: Track payment reference numbers
- **Received By**: Track which staff member processed payment
- **Automatic Balance Update**: Balance recalculates after payment

#### Transaction Tracking
- **Payment History**: Complete audit trail of all payments
- **Transaction Details**: Guest name, folio ID, amount, method, date/time
- **Payment Status**: Track paid, partial, unpaid bookings
- **User Attribution**: See which staff member received payment
- **Transaction Search**: Filter by date range, guest, payment method

#### Folio Charges Management
- **Charge Types**: Room charges, extended stay, additional charges
- **Payment Status**: Track unpaid vs paid charges
- **City Ledger Integration**: Post unpaid charges to city ledger accounts
- **Charge Details**: Description, amount, payment method, date
- **Balance Calculation**: Sum of unpaid charges = Guest balance

### 7. City Ledger (Credit Accounts)

#### Account Management
- **Organization Accounts**: Corporate/institutional credit accounts
- **Individual Accounts**: Personal credit accounts for frequent guests
- **Account Balances**: Real-time unpaid balance tracking
- **Outstanding Aging**: How long balance has been outstanding

#### City Ledger Functions
- **Create Account**: Add new individual or organization account
- **Link Bookings**: Charge room stays to city ledger account
- **Track Charges**: Monitor all charges against account
- **View Balance**: Total outstanding balance
- **Payment Recording**: Record payments against account
- **Aging Report**: Show overdue balances

### 8. Night Audit & Daily Operations

#### Night Audit Process
- **Automated Calculations**: System-generated audit summary
- **Occupancy Rate**: Calculate based on rooms occupied vs available
- **Revenue Summary**: Total revenue for audit period by payment method
- **Expected vs Actual**: Variance analysis for audit
- **Guest Checkins/Checkouts**: Count of arrivals and departures
- **Outstanding Issues**: Alerts for unpaid balances, maintenance needed

#### Pending Operations
- **Pending Checkouts**: Guests who should check out today
- **Expected Arrivals**: Guests checking in today
- **Maintenance Alerts**: Rooms requiring attention
- **Unpaid Folios**: Guests with outstanding balances

### 9. Reporting & Insights

#### Financial Reports
- **Daily Revenue Report**: Revenue by payment method for specific date
- **Revenue Trends**: Multi-period comparison and trends
- **Payment Method Mix**: Percentage breakdown of payment methods
- **Outstanding Balances**: City ledger aging report
- **Folio Analysis**: Individual folio details and payment status

#### Operational Reports
- **Occupancy Report**: Room utilization over time
- **Guest Statistics**: Total guests, repeat guests, new guests
- **Room Performance**: Revenue per room type
- **Staff Performance**: Payments processed by staff member
- **Reconciliation Report**: System balances vs physical inventory

#### Analytics Dashboard
- **Custom Date Ranges**: Select any date range for analysis
- **Multiple Visualizations**: Bar charts, line charts, pie charts
- **Export Reports**: Download data as PDF for external use
- **Trend Analysis**: Identify patterns and opportunities

### 10. User & Access Management

#### Role-Based Access Control (RBAC)
- **Admin**: Full system access, user management, configuration
- **Manager**: Operations oversight, reporting, user supervision
- **Staff**: Daily operations (bookings, payments, check-in)
- **Accountant**: Financial reports and reconciliation only
- **Viewer**: Read-only access to reports

#### Features
- **User Profiles**: Create staff accounts with roles
- **Permission Matrix**: Granular access control per feature
- **Activity Logging**: Track user actions for audit
- **Session Management**: Login/logout, password management
- **Organization Isolation**: Multi-tenant data separation

---

## Database Schema

### Core Tables

#### Organizations
```
- id (UUID)
- name (TEXT)
- email (TEXT)
- phone (TEXT)
- address (TEXT)
- city, country (TEXT)
- timezone, currency (TEXT)
- created_at, updated_at (TIMESTAMP)
```

#### Profiles (Users)
```
- id (UUID) - Links to auth.users
- organization_id (UUID) - Organization they belong to
- full_name (TEXT)
- role (TEXT) - admin, manager, staff, accountant, viewer
- avatar_url (TEXT)
```

#### Rooms
```
- id (UUID)
- room_number (TEXT)
- floor_number (INT)
- room_type (TEXT)
- status (TEXT) - available, occupied, maintenance, reserved
- price_per_night (DECIMAL)
- max_occupancy (INT)
- amenities (TEXT[])
```

#### Guests
```
- id (UUID)
- name (TEXT)
- email, phone (TEXT)
- id_type, id_number (TEXT) - Passport, Driver's License, etc.
- address, city, country (TEXT)
- date_of_birth (DATE)
- notes (TEXT)
```

#### Bookings
```
- id (UUID)
- guest_id (UUID)
- room_id (UUID)
- folio_id (TEXT) - Unique reference number
- check_in, check_out (DATE)
- number_of_nights (INT)
- rate_per_night (DECIMAL)
- total_amount (DECIMAL)
- deposit (DECIMAL)
- balance (DECIMAL)
- payment_status (TEXT) - pending, partial, paid
- status (TEXT) - active, checked_in, checked_out, cancelled
- notes (TEXT)
- created_by (UUID)
```

#### Payments
```
- id (UUID)
- booking_id (UUID)
- guest_id (UUID)
- amount (DECIMAL)
- payment_method (TEXT) - cash, pos, transfer, bank_transfer, city_ledger
- payment_date (TIMESTAMP)
- reference_number (TEXT)
- received_by (UUID)
- notes (TEXT)
```

#### Folio Charges
```
- id (UUID)
- booking_id (UUID)
- description (TEXT)
- amount (DECIMAL)
- charge_type (TEXT) - room, extended_stay, additional, payment
- payment_method (TEXT)
- payment_status (TEXT) - unpaid, pending, paid
- ledger_account_id (UUID) - If charged to city ledger
- ledger_account_type (TEXT) - individual or organization
- created_by (UUID)
```

#### City Ledger Accounts
```
- id (UUID)
- account_name (TEXT)
- account_type (TEXT) - individual or organization
- contact_email, contact_phone (TEXT)
- balance (DECIMAL)
```

#### Night Audits
```
- id (UUID)
- audit_date (DATE)
- total_checkouts, total_checkins (INT)
- occupancy_rate (DECIMAL)
- expected_revenue, actual_revenue (DECIMAL)
- variance (DECIMAL)
- issues (TEXT[])
- notes (TEXT)
```

#### Transactions
```
- id (UUID)
- transaction_id (TEXT)
- booking_id (UUID)
- guest_name (TEXT)
- room (TEXT)
- amount (DECIMAL)
- payment_method (TEXT)
- status (TEXT)
- description (TEXT)
- received_by (TEXT)
- created_at (TIMESTAMP)
```

---

## User Roles & Permissions

| Feature | Admin | Manager | Staff | Accountant | Viewer |
|---------|-------|---------|-------|-----------|--------|
| Dashboard | Full | Full | Summary | Limited | Summary |
| Create Booking | Yes | Yes | Yes | No | No |
| Record Payment | Yes | Yes | Yes | No | No |
| Add Charges | Yes | Yes | Yes | No | No |
| Extend Stay | Yes | Yes | Yes | No | No |
| View Reports | Yes | Yes | Limited | Yes | Yes |
| Manage Users | Yes | No | No | No | No |
| View Analytics | Yes | Yes | Limited | Yes | Yes |
| Night Audit | Yes | Yes | No | No | No |
| Room Management | Yes | Yes | No | No | No |
| Guest Management | Yes | Yes | Yes | Limited | No |
| City Ledger | Yes | Yes | Limited | Yes | No |

---

## Financial Management

### Revenue Tracking

#### Payment Methods Supported
1. **Cash** - Direct cash payment at check-in/checkout
2. **POS** - Point of Sale card payments
3. **Bank Transfer** - Direct bank-to-bank transfers
4. **City Ledger** - Credit account billing for corporations/individuals

#### Balance Calculation
```
Guest Balance = Sum of (Unpaid Folio Charges)
              = Room charge - deposits - payments received

Folio Charge = Any amount owed (room, extended stay, extras)
Payment Status: unpaid → pending → paid
```

#### Multi-Method Payments
- **Partial Payments**: Guest can pay partial amount with multiple methods
- **Split Payments**: One booking charged across multiple payment methods
- **Credit Holds**: City ledger accounts track monthly balances

### City Ledger

#### Purpose
- Corporate accounts for bulk billing
- Individual guest credit lines
- Bill later arrangements
- Wholesale partnerships

#### Features
- **Account Management**: Create/edit credit accounts
- **Balance Tracking**: Real-time balance per account
- **Aging Report**: Shows how long balances are outstanding
- **Settlement**: Record payments against account
- **Individual vs Organization**: Different account types

### Financial Reports

#### Reports Generated
1. **Daily Revenue Report** - By payment method
2. **Occupancy Report** - Room utilization
3. **Guest Statistics** - Count, repeat guests, LTV
4. **Outstanding Balances** - Aging analysis
5. **Payment Method Mix** - Percentage breakdown
6. **Folio Analysis** - Individual booking details
7. **Reconciliation Report** - System vs physical inventory

---

## Key Modules

### Module 1: Booking System
**Purpose**: Manage room bookings and guest stays
**Key Functions**:
- Create new bookings
- View booking details
- Extend stays
- Record payments
- Track balances
- Cancel bookings

### Module 2: Room Management
**Purpose**: Maintain room inventory and status
**Key Functions**:
- Add/edit rooms
- Set rates and amenities
- Track room status
- View occupancy
- Room detail pages

### Module 3: Guest Management
**Purpose**: Maintain guest database
**Key Functions**:
- Create guest profiles
- Edit guest information
- View booking history
- Track outstanding balances
- Add notes and preferences

### Module 4: Payment Processing
**Purpose**: Track all financial transactions
**Key Functions**:
- Record payments
- Support multiple payment methods
- Track payment references
- View transaction history
- Generate payment reports

### Module 5: Analytics & Reporting
**Purpose**: Provide business insights
**Key Functions**:
- Dashboard KPIs
- Revenue trends
- Occupancy analysis
- Payment method breakdown
- Custom date ranges
- PDF export

### Module 6: City Ledger Management
**Purpose**: Manage credit accounts
**Key Functions**:
- Create accounts
- Track balances
- View aging report
- Record payments
- Monitor outstanding debts

### Module 7: Night Audit
**Purpose**: Daily operational closing
**Key Functions**:
- Summarize daily operations
- Calculate occupancy rate
- Calculate revenue
- Identify pending checkouts
- Track issues
- Generate audit report

### Module 8: User Management
**Purpose**: Control access and permissions
**Key Functions**:
- Create user accounts
- Assign roles
- Manage permissions
- Track activity
- Configure organization settings

---

## UI/UX Components

### Data Display
- **EnhancedDataTable**: Sortable, searchable, paginated data tables with:
  - Multi-column sorting
  - Global search
  - Column filtering
  - Batch actions
  - Row selection
  - Export functionality

- **Cards**: Information display with:
  - KPI metrics
  - Statistics
  - Summary information
  - Status indicators

- **Charts**: Recharts visualizations including:
  - Bar charts for comparisons
  - Line charts for trends
  - Pie charts for breakdowns
  - Custom tooltips

### Forms & Input
- **Form Fields**: React Hook Form integration with:
  - Text inputs
  - Select dropdowns
  - Date pickers
  - Currency inputs
  - Phone inputs
  - Email validation

- **Modals**: Dialog components for:
  - Creating new records
  - Editing existing data
  - Confirming actions
  - Showing details

### Navigation
- **Sidebar**: Main navigation menu with:
  - Icon + label navigation items
  - Active state highlighting
  - Collapsible on mobile
  - Quick access to main modules

- **Breadcrumbs**: Navigation hierarchy
- **Tabs**: Content organization
- **Status Badges**: Visual status indicators

### Feedback & Notifications
- **Toast Notifications**: Success, error, info messages
- **Loading States**: Spinners during async operations
- **Skeleton Loaders**: Placeholder loading states
- **Error Messages**: Validation and error display
- **Empty States**: User-friendly empty data messaging

---

## API Endpoints (Auto-generated by PostgREST)

### Bookings
- `GET /rest/v1/bookings` - List bookings
- `GET /rest/v1/bookings/{id}` - Get booking details
- `POST /rest/v1/bookings` - Create booking
- `PATCH /rest/v1/bookings/{id}` - Update booking

### Payments
- `GET /rest/v1/payments` - List payments
- `POST /rest/v1/payments` - Record payment
- `GET /rest/v1/payments/{id}` - Payment details

### Guests
- `GET /rest/v1/guests` - List guests
- `POST /rest/v1/guests` - Create guest
- `GET /rest/v1/guests/{id}` - Guest details
- `PATCH /rest/v1/guests/{id}` - Update guest

### Rooms
- `GET /rest/v1/rooms` - List rooms
- `POST /rest/v1/rooms` - Create room
- `GET /rest/v1/rooms/{id}` - Room details
- `PATCH /rest/v1/rooms/{id}` - Update room

### City Ledger
- `GET /rest/v1/city_ledger_accounts` - List accounts
- `POST /rest/v1/city_ledger_accounts` - Create account
- `GET /rest/v1/folio_charges` - List charges

### Analytics
- `GET /rest/v1/transactions` - Payment transactions
- `GET /rest/v1/night_audits` - Audit records

---

## Performance & Scalability

### Database Optimization
- **Indexes**: Created on frequently queried columns
  - organization_id (multi-table)
  - booking dates (check_in, check_out)
  - payment dates
  - room status

- **Query Optimization**: 
  - Batch loading using IN clauses
  - Eager loading of related data
  - Pagination for large datasets (limit 1000 records)

### Balance Calculation
- **Real-time Calculation**: Balance computed from folio_charges table
- **Batch Processing**: Multiple guest balances calculated in single query
- **Caching**: Application-level caching of balance data

### Data Isolation
- **Multi-tenancy**: Each organization isolated via organization_id
- **Row-Level Security**: Database policies enforce data access
- **Cross-organization**: Impossible to view other organization data

---

## Security Features

### Authentication
- **Email/Password**: Supabase Auth integration
- **Session Management**: JWT tokens with automatic refresh
- **Cross-tab Sync**: Session persists across browser tabs
- **Secure Logout**: Session invalidation

### Authorization
- **Role-Based Access**: Admin, Manager, Staff, Accountant, Viewer
- **Row-Level Security**: Database-level access control
- **Permission Matrix**: Feature-level access restrictions
- **Activity Audit Trail**: Track user actions

### Data Protection
- **Encryption**: HTTPS only communication
- **Password Hashing**: Bcrypt hashing in database
- **API Keys**: Environment variable protection
- **Data Isolation**: Organization-specific data access

---

## Deployment & Hosting

### Hosting Platform
- **Vercel**: Edge-optimized deployment
- **Regions**: Global CDN for fast content delivery
- **Auto-scaling**: Automatic scaling based on traffic
- **CI/CD**: GitHub integration for automatic deployments

### Database
- **Supabase**: Managed PostgreSQL
- **Backups**: Automatic daily backups
- **Replication**: Real-time data replication
- **Disaster Recovery**: Point-in-time recovery

### Environment Configuration
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=production
```

---

## Future Enhancement Opportunities

1. **Mobile App** - Native iOS/Android applications
2. **WhatsApp Integration** - Send booking confirmations via WhatsApp
3. **SMS Notifications** - Text alerts for payments and check-ins
4. **Email Automation** - Automated booking confirmations and reminders
5. **Housekeeping Module** - Task management for cleaning staff
6. **Maintenance Module** - Maintenance request tracking
7. **Channel Manager** - Integration with OTA (Booking.com, Airbnb)
8. **PMS Advanced Features** - Rate optimization, revenue management
9. **Integration APIs** - Connect with accounting software
10. **Advanced Reporting** - Business intelligence and predictive analytics

---

## Conclusion

FrontBill is a comprehensive, scalable hotel management system designed specifically for the African hospitality market. It combines real-time booking management, financial tracking, occupancy analytics, and operational insights in a single integrated platform. Built with modern web technologies and best practices, FrontBill enables hoteliers to streamline operations, reduce manual work, and make data-driven business decisions.

With its multi-tenant architecture, role-based access control, and real-time data synchronization, FrontBill is production-ready for hotels of any size, from boutique guesthouses to large hotel chains.

---

**Version**: 1.0  
**Last Updated**: March 2026  
**Platform**: Web-based SaaS  
**Technology Stack**: Next.js 16, React 19, TypeScript, Supabase, Tailwind CSS  
**Target Markets**: Africa, Hospitality Industry  
**Multi-tenancy**: Yes  
**Real-time Updates**: Yes  
**Mobile Responsive**: Yes  
**API**: RESTful (PostgREST)
