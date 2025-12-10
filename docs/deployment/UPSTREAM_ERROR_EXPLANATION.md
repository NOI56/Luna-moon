# Upstream Error Explanation

## Problem: "Connection refused" error shows Northflank's default error page instead of our custom error page

### Why This Happens

When you see the error message:
```
upstream connect error or disconnect/reset before headers. 
retried and the latest reset reason: remote connection failure, 
transport failure reason: delayed connect error: Connection refused
```

This error occurs at the **upstream level** (Northflank's load balancer) **before** the request reaches your Express server.

### Two Scenarios

#### 1. Server Not Started / Crashed
- **Problem**: Server hasn't started or crashed during startup
- **Result**: Northflank can't connect to your server → Shows Northflank's default error page
- **Solution**: Check Northflank logs to see why server isn't starting

#### 2. Server Started But Internal Error
- **Problem**: Server is running but encounters an error (502, 503, 500)
- **Result**: Express error handler catches it → Shows our custom error page (`offline.html` or `500.html`)
- **Solution**: Our error pages will work correctly

### How to Check Server Status

1. **Go to Northflank Dashboard**
   - Navigate to: `https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon`
   - Click on "Logs" tab

2. **Check for Errors**
   - Look for startup errors
   - Check for crash messages
   - Verify environment variables are set correctly

3. **Common Issues**
   - Missing environment variables
   - Port configuration mismatch
   - Database connection errors
   - Module import errors

### What We've Fixed

✅ Updated error handler to use `offline.html` for 502/503 errors  
✅ Error pages will now show when server is running but encounters errors

### What Still Needs Your Attention

⚠️ If server is not starting at all, you need to:
1. Check Northflank logs
2. Fix the startup issue
3. Once server starts, our error pages will work

### Next Steps

1. Check Northflank logs to see why server isn't starting
2. Fix any configuration errors
3. Restart the service
4. Test again - our custom error pages should now work












