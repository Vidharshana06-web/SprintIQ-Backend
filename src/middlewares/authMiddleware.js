const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  try {
    // Get token from header
    let token = req.headers.authorization;

    if (!token || !token.startsWith("Bearer ")) {
      return res.status(401).json({ 
        success: false,
        message: "No token provided. Authorization header required" 
      });
    }

    // Extract token (remove "Bearer ")
    token = token.split(" ")[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token format" 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user to request (expects { id: userId } from your authController)
    req.user = decoded;
    next();

  } catch (error) {
    console.error("Auth middleware error:", error.message);
    
    // Specific error messages for frontend
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ 
        success: false,
        message: "Token expired. Please login again" 
      });
    }
    
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ 
        success: false,
        message: "Invalid token signature" 
      });
    }

    return res.status(401).json({ 
      success: false,
      message: "Not authorized. Token failed verification" 
    });
  }
};

module.exports = protect;
