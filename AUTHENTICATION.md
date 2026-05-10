# Authentication System Documentation - StayVista

## Overview
The StayVista project uses a **hybrid authentication approach** combining:
1. **Passport.js** with Local Strategy (username/password authentication)
2. **Express-session** for session management
3. **MongoDB Session Store** for persistent sessions
4. **Custom CAPTCHA validation** for registration and login security
5. **Email verification** for new user registration

---

## Architecture

### 1. **Session Management**

#### Session Store (MongoDB)
- **Package**: `connect-mongodb-session`
- **Location**: `app.js` (lines 24-28)
- **Database Collection**: `sessionStore`
- **Configuration**:
  ```javascript
  const store = new MongoDBStore({
      uri: databaseURL,
      collection: 'sessionStore'
  });
  ```

#### Session Configuration
- **Package**: `express-session`
- **Location**: `app.js` (lines 32-40)
- **Settings**:
  - **Secret**: `sessionSecret` from config
  - **Max Age**: 7 days (604,800,000 ms)
  - **HttpOnly**: `true` (protects against XSS)
  - **Secure**: `false` (for development; should be `true` in production with HTTPS)

```javascript
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        secure: false
    },
    store: store
}));
```

---

### 2. **Passport.js Setup**

#### Strategy
- **Type**: Local Strategy (`passport-local`)
- **Serialization**: Custom methods from `logins.serializeUser()` and `logins.deserializeUser()`
- **User Model**: `Login` model with `passportLocalMongoose` plugin

#### Configuration
- **Location**: `app.js` (lines 45-56)
- **Username Field**: `email`
- **Password Field**: `pass`

```javascript
const passport = require('passport');
const LocalStrategy = require('passport-local');

passport.use('passport-local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'pass'
}, logins.authenticate()));

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser(logins.serializeUser());
passport.deserializeUser(logins.deserializeUser());
```

---

### 3. **User Models**

#### Login Model
- **Location**: `models/login.js`
- **Uses Plugin**: `passport-local-mongoose` (handles password hashing & authentication)
- **Fields**:
  - `username` (email - handled by plugin)
  - `password` (hashed - handled by plugin)
  - `role` (String): `'rider'`, `'provider'`, or `'admin'`
  - `name` (String): Full name
  - `isFilled` (Boolean): Profile completion status

```javascript
const schema = new mongoose.Schema({
    role: String,
    name: String,
    isFilled: {
        type: Boolean,
        default: false
    }
});

schema.plugin(passportLocalMongoose);
const model = mongoose.model('Login', schema);
```

#### Registration Model
- **Location**: `models/register.js`
- **Purpose**: Temporary storage for pending registrations
- **Fields**:
  - `email`
  - `pass` (plain text before validation)
  - `name`
  - `role`
  - `validationKey` (unique, sent via email)

#### Rider & Provider Models
- **Location**: `models/rider.js` and `models/provider.js`
- **Created After**: Email validation succeeds
- **Linked To**: `Login` model via user creation

---

## Authentication Flow

### 1. **Registration Flow** (`routes/auth.js`)

#### Step 1: Registration Form
- **Route**: `GET /auth/registration`
- **View**: `views/user-registration.ejs`
- **User provides**: Email, Password, Name, Role (Rider/Provider)

#### Step 2: Validation & Storage
- **Route**: `POST /auth/registration`
- **Middleware**: `validateRegistration` (from `middlewares/schema_validator.js`)
- **Process**:
  1. Check if email already exists in `Login` model
  2. Generate unique `validationKey`
  3. Store in `Registration` model with encrypted password
  4. Send email with validation link containing `validationKey`

#### Step 3: Email Verification
- **Route**: `GET /auth/validate?validationKey=<key>`
- **Process**:
  1. Find `Registration` record by `validationKey`
  2. Create user in `Login` model using `logins.register()` (from passport-local-mongoose)
  3. Create role-specific record (`Rider` or `Provider`)
  4. Delete temporary `Registration` record
  5. Redirect to success page

#### Example Flow:
```
User Registration Form
    ↓
POST /auth/registration
    ↓
Validation Check (schema & duplicate email)
    ↓
Generate validationKey
    ↓
Store in Registration model
    ↓
Send Email with Link: /auth/validate?validationKey=<key>
    ↓
User Clicks Email Link
    ↓
GET /auth/validate?validationKey=<key>
    ↓
Create Login record
    ↓
Create Rider/Provider record
    ↓
Delete Registration record
    ↓
Success Page
```

---

### 2. **Login Flow**

#### Step 1: CAPTCHA Generation
- **Route**: `GET /auth/login`
- **Process**: Generate random CAPTCHA (one of 4 types)
- **CAPTCHA Types**:
  1. **Arithmetic**: `(a + b) x c`, `a - b + c x 2`, `a + b x m - c`
  2. **Sequence**: Predict next number in arithmetic sequence
  3. **Word Position**: Type specific letters from a word
  4. **Reverse**: Type token in reverse

#### Step 2: CAPTCHA Validation & Authentication
- **Route**: `POST /auth/login`
- **Middleware**: `validateLogin`
- **Process**:
  1. Verify CAPTCHA answer (normalized to lowercase, no spaces)
  2. Use Passport.js `authenticate()` with local strategy
  3. On success: Create session, populate `req.user` and `req.session.userRoleID`
  4. Redirect to dashboard (`/rider/dashboard` or `/provider/dashboard`)
  5. On failure: Return error message

```javascript
router.post('/auth/login', validateLogin, (req, res, next) => {
    passport.authenticate('passport-local', (err, user, info) => {
        // CAPTCHA check
        // Session creation
        // Redirect
    })(req, res, next);
});
```

---

### 3. **Session Persistence**

#### Session Middleware
- **Location**: `middlewares/common.js`
- **Function**: `addRoleID`
- **Purpose**: Populate `req.session.userRoleID` and `req.user` on each request

```javascript
app.use(addRoleID);
```

#### Protected Routes
- **Middleware**: Role validators from `middlewares/role_validator.js`
- **Examples**:
  - `isLoggedIn`: Checks if user has valid session
  - `isRoleProvider`: Allows only providers
  - `isRoleRider`: Allows only riders
  - `isRoleAdmin`: Allows only admins

---

### 4. **Password Management**

#### Forgot Password Flow
- **Route**: `POST /auth/forgot-password`
- **Process**:
  1. Generate unique `forgetPasswordKey`
  2. Store in `Key` model with expiry (typically 1 hour)
  3. Send email with password reset link
  4. User clicks link: `GET /auth/reset-pass?key=<key>`
  5. Render password reset form
  6. `POST /auth/change-pass`: Update password in `Login` model

#### Password Change (Logged In)
- **Route**: `POST /auth/change-password`
- **Protection**: `isLoggedIn` middleware
- **Process**:
  1. Verify current password using Passport's built-in method
  2. Update password using `setPassword()` from passport-local-mongoose
  3. Save changes
  4. Send confirmation email

---

## Key Components & Files

| File | Purpose | Key Functions |
|------|---------|---|
| `models/login.js` | User credentials storage | `authenticate()`, `serializeUser()`, `deserializeUser()` |
| `models/register.js` | Temporary registration data | Stores unvalidated registrations |
| `models/rider.js` | Rider profile data | Linked to `Login` model |
| `models/provider.js` | Provider profile data | Linked to `Login` model |
| `routes/auth.js` | Authentication routes | Registration, login, validation, password management |
| `middlewares/role_validator.js` | Role-based access control | `isLoggedIn`, `isRoleProvider`, `isRoleRider`, `isRoleAdmin` |
| `middlewares/schema_validator.js` | Form validation | `validateRegistration`, `validateLogin` |
| `utils/mail_sender.js` | Email notifications | `sendRegistrationEmail`, `sendForgotPasswordEmail` |

---

## Security Features

1. **Password Hashing**: Handled by `passport-local-mongoose` (uses bcrypt)
2. **Session Security**: HttpOnly cookies prevent XSS attacks
3. **Email Verification**: Prevents fake email registration
4. **CAPTCHA Protection**: Prevents automated registration/login attacks
5. **Role-Based Access Control**: Middleware validates user role before allowing access
6. **Password Reset Expiry**: Tokens expire after set time
7. **MongoDB Session Store**: Persists sessions securely in database

---

## How to Add New Users Programmatically

```javascript
const logins = require('./models/login');
const riders = require('./models/rider');

// Create login credentials
const newUser = new logins({
    username: 'user@example.com',
    name: 'User Name',
    role: 'rider'
});

// Register password using passport-local-mongoose
await logins.register(newUser, 'password123');

// Create rider profile
await riders.create({
    email: 'user@example.com',
    name: 'User Name'
});
```

---

## Environment Variables Required

```env
SESSION_SECRET=your-secret-key-here
DATABASE_URL=mongodb://...
```

---

## Important Notes

1. **Password Reset Link**: Valid for limited time (configurable in code)
2. **Session Expiry**: 7 days by default (configurable in `app.js`)
3. **Email Verification**: Required for account creation (not optional)
4. **Role Assignment**: Done during registration, cannot be changed via UI
5. **Admin Access**: Created manually in database or via `/auth/admin-registration` if enabled
6. **Logout**: Clears session from MongoDB and client-side cookies

---

## Dependencies

```json
{
  "passport": "^0.6.0",
  "passport-local": "^1.0.0",
  "passport-local-mongoose": "^7.1.2",
  "express-session": "^1.17.3",
  "connect-mongodb-session": "^3.1.1",
  "cookie-parser": "^1.4.6",
  "bcrypt": "^5.0.0" (implicit from passport-local-mongoose)
}
```

---

## Testing Authentication

### Test Registration
```bash
curl -X POST http://localhost:3000/auth/registration \
  -d "email=test@example.com&pass=password&name=Test&role=rider" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

### Test Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -d "email=test@example.com&pass=password&captcha=answer" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

### Test Protected Route
```bash
curl http://localhost:3000/rider/dashboard \
  -H "Cookie: connect.sid=<session_id>"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Email already exists" | Use unique email for registration |
| "Invalid validation key" | Check email link, key may have expired |
| CAPTCHA always fails | Ensure answer normalization matches code |
| Session not persisting | Check MongoDB connection and `sessionStore` collection |
| Cannot access protected routes | Verify user is logged in (`req.user` should exist) |

