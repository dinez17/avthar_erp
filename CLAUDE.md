# TilesERP Development Instructions

You are the lead software architect and senior full-stack engineer responsible for building an enterprise-grade Tiles ERP.

## Goal

Develop a production-ready Progressive Web Application (PWA) for tile wholesalers and retailers.

The system must be modular, scalable, secure, and enterprise-ready.

Never generate demo code, placeholder code, mock data, or shortcuts unless explicitly requested.

Every module must be production quality.

---

# Tech Stack

Frontend

- React
- TypeScript
- Vite
- Material UI
- AG Grid Enterprise
- TanStack Query
- React Hook Form
- Zod
- PWA
- IndexedDB
- Workbox

Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Swagger

Deployment

Ubuntu

Docker

Nginx

PM2

---

# Architecture

Use Clean Architecture.

Follow Domain Driven Design.

Separate

Application

Domain

Infrastructure

Presentation

Never put business logic inside controllers.

---

# Coding Standards

- SOLID
- DRY
- KISS
- Repository Pattern
- Dependency Injection
- CQRS where appropriate
- Strong typing
- No any in TypeScript
- No duplicated code

---

# Database

PostgreSQL

UUID primary keys.

Soft Delete.

Audit Fields

CreatedBy

CreatedAt

ModifiedBy

ModifiedAt

DeletedBy

DeletedAt

Optimistic concurrency.

---

# Authentication

JWT

Refresh Token

RBAC

Department Permission

Branch Permission

Godown Permission

Gate Permission

Approval Levels

---

# Company Hierarchy

Company

↓

Branch

↓

Godown

↓

Gate

↓

Rack (Optional)

---

# ERP Modules

Authentication

User Management

Role Management

Department Management

Company

Branch

Godown

Gate

Customer

Supplier

Transporter

Vehicle

Driver

Category

Brand

Series

Product

Inventory

Purchase

Sales

CRM

Telecalling

Marketing

Billing

Accounts

Warehouse

Dispatch

Gate Pass

Logistics

Reports

Dashboard

Settings

Supplier Portal

Customer Portal

Notification

Audit

SixOrbit Integration

---

# Product Requirements

Products support

Box

Piece

Sq.ft

Multiple Suppliers

Multiple Purchase Rates

Landing Cost

GST

HSN

Barcode

QR Code

Shade

Batch

Series

Brand

Collection

---

# Inventory

Maintain stock by

Company

Branch

Godown

Gate

Batch

Shade

Product

Stock Movement only.

Never directly update stock.

---

# Sales

Quotation

Sales Order

Reservation

Allocation

Invoice

Delivery

Collection

Customer Ledger

---

# Split Invoice

Sales Order is parent.

Multiple invoices allowed.

One invoice per branch.

Automatic allocation.

---

# Cross Branch

Auto stock allocation.

Auto invoice splitting.

Branch-wise GST.

---

# Customer Credit

Credit Days

Credit Limit

Advance

Outstanding

Approval Workflow

---

# Logistics

Vehicle

Trip

Driver

Gate Pass

Loading

Unloading

Transport Charges

Proof Of Delivery

Multiple invoices per gate pass.

---

# Supplier Portal

Supplier Login

Products

Orders

Payments

Invoices

Documents

Stock Visibility

---

# CRM

Lead

Telecalling

Marketing

Sales Visit

Quotation

Sales Order

Invoice

---

# SixOrbit

Auto Sync

Customer

Manual Sync

Sales Invoice

Retry Queue

Sync Log

---

# Reports

Dashboard

Sales

Purchase

Inventory

GST

Finance

Profit

Branch

Godown

Gate

Vehicle

Trip

Supplier

Customer

---

# UI

Responsive

Professional

Material UI

Dark Mode

Light Mode

Keyboard Shortcuts

Barcode Scanner

PWA

Offline Support

---

# Deliverables

Whenever generating a module:

1. Database Schema
2. Prisma Schema
3. DTOs
4. Validation
5. Services
6. Controllers
7. Permissions
8. API
9. React Pages
10. Forms
11. Grid
12. Unit Tests
13. Integration Tests
14. Swagger
15. Documentation

Never skip steps.

# TilesERP Development Instructions

You are the lead software architect and senior full-stack engineer responsible for building an enterprise-grade Tiles ERP.

## Goal

Develop a production-ready Progressive Web Application (PWA) for tile wholesalers and retailers.

The system must be modular, scalable, secure, and enterprise-ready.

Never generate demo code, placeholder code, mock data, or shortcuts unless explicitly requested.

Every module must be production quality.

---

# Tech Stack

Frontend

- React
- TypeScript
- Vite
- Material UI
- AG Grid Enterprise
- TanStack Query
- React Hook Form
- Zod
- PWA
- IndexedDB
- Workbox

Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Swagger

Deployment

Ubuntu

Docker

Nginx

PM2

---

# Architecture

Use Clean Architecture.

Follow Domain Driven Design.

Separate

Application

Domain

Infrastructure

Presentation

Never put business logic inside controllers.

---

# Coding Standards

- SOLID
- DRY
- KISS
- Repository Pattern
- Dependency Injection
- CQRS where appropriate
- Strong typing
- No any in TypeScript
- No duplicated code

---

# Database

PostgreSQL

UUID primary keys.

Soft Delete.

Audit Fields

CreatedBy

CreatedAt

ModifiedBy

ModifiedAt

DeletedBy

DeletedAt

Optimistic concurrency.

---

# Authentication

JWT

Refresh Token

RBAC

Department Permission

Branch Permission

Godown Permission

Gate Permission

Approval Levels

---

# Company Hierarchy

Company

↓

Branch

↓

Godown

↓

Gate

↓

Rack (Optional)

---

# ERP Modules

Authentication

User Management

Role Management

Department Management

Company

Branch

Godown

Gate

Customer

Supplier

Transporter

Vehicle

Driver

Category

Brand

Series

Product

Inventory

Purchase

Sales

CRM

Telecalling

Marketing

Billing

Accounts

Warehouse

Dispatch

Gate Pass

Logistics

Reports

Dashboard

Settings

Supplier Portal

Customer Portal

Notification

Audit

SixOrbit Integration

---

# Product Requirements

Products support

Box

Piece

Sq.ft

Multiple Suppliers

Multiple Purchase Rates

Landing Cost

GST

HSN

Barcode

QR Code

Shade

Batch

Series

Brand

Collection

---

# Inventory

Maintain stock by

Company

Branch

Godown

Gate

Batch

Shade

Product

Stock Movement only.

Never directly update stock.

---

# Sales

Quotation

Sales Order

Reservation

Allocation

Invoice

Delivery

Collection

Customer Ledger

---

# Split Invoice

Sales Order is parent.

Multiple invoices allowed.

One invoice per branch.

Automatic allocation.

---

# Cross Branch

Auto stock allocation.

Auto invoice splitting.

Branch-wise GST.

---

# Customer Credit

Credit Days

Credit Limit

Advance

Outstanding

Approval Workflow

---

# Logistics

Vehicle

Trip

Driver

Gate Pass

Loading

Unloading

Transport Charges

Proof Of Delivery

Multiple invoices per gate pass.

---

# Supplier Portal

Supplier Login

Products

Orders

Payments

Invoices

Documents

Stock Visibility

---

# CRM

Lead

Telecalling

Marketing

Sales Visit

Quotation

Sales Order

Invoice

---

# SixOrbit

Auto Sync

Customer

Manual Sync

Sales Invoice

Retry Queue

Sync Log

---

# Reports

Dashboard

Sales

Purchase

Inventory

GST

Finance

Profit

Branch

Godown

Gate

Vehicle

Trip

Supplier

Customer

---

# UI

Responsive

Professional

Material UI

Dark Mode

Light Mode

Keyboard Shortcuts

Barcode Scanner

PWA

Offline Support

---

# Deliverables

Whenever generating a module:

1. Database Schema
2. Prisma Schema
3. DTOs
4. Validation
5. Services
6. Controllers
7. Permissions
8. API
9. React Pages
10. Forms
11. Grid
12. Unit Tests
13. Integration Tests
14. Swagger
15. Documentation

Never skip steps.

# TilesERP Development Instructions

You are the lead software architect and senior full-stack engineer responsible for building an enterprise-grade Tiles ERP.

## Goal

Develop a production-ready Progressive Web Application (PWA) for tile wholesalers and retailers.

The system must be modular, scalable, secure, and enterprise-ready.

Never generate demo code, placeholder code, mock data, or shortcuts unless explicitly requested.

Every module must be production quality.

---

# Tech Stack

Frontend

- React
- TypeScript
- Vite
- Material UI
- AG Grid Enterprise
- TanStack Query
- React Hook Form
- Zod
- PWA
- IndexedDB
- Workbox

Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Swagger

Deployment

Ubuntu

Docker

Nginx

PM2

---

# Architecture

Use Clean Architecture.

Follow Domain Driven Design.

Separate

Application

Domain

Infrastructure

Presentation

Never put business logic inside controllers.

---

# Coding Standards

- SOLID
- DRY
- KISS
- Repository Pattern
- Dependency Injection
- CQRS where appropriate
- Strong typing
- No any in TypeScript
- No duplicated code

---

# Database

PostgreSQL

UUID primary keys.

Soft Delete.

Audit Fields

CreatedBy

CreatedAt

ModifiedBy

ModifiedAt

DeletedBy

DeletedAt

Optimistic concurrency.

---

# Authentication

JWT

Refresh Token

RBAC

Department Permission

Branch Permission

Godown Permission

Gate Permission

Approval Levels

---

# Company Hierarchy

Company

↓

Branch

↓

Godown

↓

Gate

↓

Rack (Optional)

---

# ERP Modules

Authentication

User Management

Role Management

Department Management

Company

Branch

Godown

Gate

Customer

Supplier

Transporter

Vehicle

Driver

Category

Brand

Series

Product

Inventory

Purchase

Sales

CRM

Telecalling

Marketing

Billing

Accounts

Warehouse

Dispatch

Gate Pass

Logistics

Reports

Dashboard

Settings

Supplier Portal

Customer Portal

Notification

Audit

SixOrbit Integration

---

# Product Requirements

Products support

Box

Piece

Sq.ft

Multiple Suppliers

Multiple Purchase Rates

Landing Cost

GST

HSN

Barcode

QR Code

Shade

Batch

Series

Brand

Collection

---

# Inventory

Maintain stock by

Company

Branch

Godown

Gate

Batch

Shade

Product

Stock Movement only.

Never directly update stock.

---

# Sales

Quotation

Sales Order

Reservation

Allocation

Invoice

Delivery

Collection

Customer Ledger

---

# Split Invoice

Sales Order is parent.

Multiple invoices allowed.

One invoice per branch.

Automatic allocation.

---

# Cross Branch

Auto stock allocation.

Auto invoice splitting.

Branch-wise GST.

---

# Customer Credit

Credit Days

Credit Limit

Advance

Outstanding

Approval Workflow

---

# Logistics

Vehicle

Trip

Driver

Gate Pass

Loading

Unloading

Transport Charges

Proof Of Delivery

Multiple invoices per gate pass.

---

# Supplier Portal

Supplier Login

Products

Orders

Payments

Invoices

Documents

Stock Visibility

---

# CRM

Lead

Telecalling

Marketing

Sales Visit

Quotation

Sales Order

Invoice

---

# SixOrbit

Auto Sync

Customer

Manual Sync

Sales Invoice

Retry Queue

Sync Log

---

# Reports

Dashboard

Sales

Purchase

Inventory

GST

Finance

Profit

Branch

Godown

Gate

Vehicle

Trip

Supplier

Customer

---

# UI

Responsive

Professional

Material UI

Dark Mode

Light Mode

Keyboard Shortcuts

Barcode Scanner

PWA

Offline Support

---

# Deliverables

Whenever generating a module:

1. Database Schema
2. Prisma Schema
3. DTOs
4. Validation
5. Services
6. Controllers
7. Permissions
8. API
9. React Pages
10. Forms
11. Grid
12. Unit Tests
13. Integration Tests
14. Swagger
15. Documentation

Never skip steps.
