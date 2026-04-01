# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Security Enhancements

This application includes several security improvements for the authentication system:

### 🔐 Authentication Security Features

1. **Client-Side Input Validation**
   - Email format validation using regex
   - Password strength requirements (8+ chars, uppercase, lowercase, numbers)
   - Field-specific error messages

2. **Rate Limiting & Account Protection**
   - Maximum 5 login attempts before temporary lockout
   - 15-minute lockout period after failed attempts
   - Progressive error messages showing attempt count
   - Automatic lockout timer with countdown

3. **Audit Logging**
   - All login attempts logged to Firestore `login_logs` collection
   - Records success/failure status, timestamp, and user agent
   - Admin-only access to login logs

4. **Enhanced Session Management**
   - Firebase session persistence (auto-clear on browser close)
   - Secure logout with complete session cleanup
   - Role-based access control with protected routes

### 🛡️ Firestore Security Rules

The application includes comprehensive Firestore security rules (`firestore.rules`):

- Users can only read/write their own data
- Admins have elevated permissions
- Login logs are admin-only readable
- Server-side write protection for sensitive data

### 🚀 Deployment Security Checklist

Before deploying to production:

1. **Enable HTTPS** - Always use SSL/TLS certificates
2. **Environment Variables** - Ensure Firebase config is properly secured
3. **Firestore Rules** - Deploy the security rules to Firebase
4. **Monitoring** - Set up alerts for suspicious login activity
5. **Regular Updates** - Keep Firebase SDK and dependencies updated

### 📋 Security Best Practices Implemented

- ✅ Strong password requirements
- ✅ Account lockout protection
- ✅ Audit logging
- ✅ Input sanitization
- ✅ Secure session handling
- ✅ Role-based access control
- ✅ Firebase security rules

## 🏥 Patient Management Features

This application provides comprehensive patient data management with the following features:

### 📊 Patient Data Fields
- **HN Number**: Unique hospital number identifier
- **Full Name**: First name and last name
- **Birth Date**: Date of birth for age calculation and medical records
- **Phone Number**: Contact information
- **Address**: Residential address
- **Allergy History**: Medication allergies with tag-based display

### 👥 Multi-Role Access Control
- **Admin**: Full CRUD operations on all patient data
- **Staff**: Full CRUD operations on patient data
- **Doctor**: Read-only access to patient information (view patient data only)

### 🔍 Advanced Search & Filtering
- Search across HN, first name, last name, and phone number
- Real-time filtering as you type
- Responsive table design with hover effects

### ✅ Data Validation & Error Handling
- Required field validation for critical information
- Input sanitization and trimming
- User-friendly error messages and success notifications
- Form reset after successful operations

### 👨‍⚕️ Doctor Patient Management (Read-Only)
- **View Patient Data**: Doctors can view all patient information including HN, name, birth date, phone, address, and allergy history
- **Search & Filter**: Real-time search across patient data
- **No Edit Permissions**: Doctors cannot add, edit, or delete patient records
- **Secure Access**: Protected route with doctor role validation
