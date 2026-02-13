const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ SIGNUP - 4 Fields + Confirm Password
exports.registerUser = async (req, res) => {
  try {
    const { name, email, organization, password, confirmPassword } = req.body;

    // 5-FIELD VALIDATION
    if (!name || !email || !organization || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: "All fields required: name, email, organization, password, confirm password" 
      });
    }

    // Password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: "Passwords do not match" 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: "Password must be at least 6 characters" 
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: "User already exists with this email" 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with organization
    const user = await User.create({
      name,
      email,
      organization,
      password: hashedPassword
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ 
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        organization: user.organization
      }
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error during registration" 
    });
  }
};

// ✅ LOGIN - Updated response structure
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email and password are required" 
      });
    }

    // Find user with password
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Check password match
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        organization: user.organization
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error during login" 
    });
  }
};

// ✅ GET USER PROFILE (Protected route)
exports.getUserProfile = async (req, res) => {
  try {
    // req.user.id comes from auth middleware
    const user = await User.findById(req.user.id).select("-password");
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching profile" 
    });
  }
};

// ✅ GITHUB OAUTH CALLBACK (Updated for organization)
exports.githubCallback = async (req, res) => {
  try {
    const { name, email, githubId } = req.user; // From GitHub strategy

    let user = await User.findOne({ 
      $or: [{ email }, { githubId }] 
    });

    if (!user) {
      // Create GitHub user (organization optional for GitHub)
      user = await User.create({
        name,
        email,
        githubId,
        isGithubUser: true,
        organization: req.user.organization || "GitHub User" // Fallback
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "GitHub login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        organization: user.organization,
        githubId: user.githubId
      }
    });

  } catch (error) {
    console.error("GitHub callback error:", error);
    res.status(500).json({ 
      success: false,
      message: "GitHub authentication failed" 
    });
  }
};
