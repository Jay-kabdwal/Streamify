import { generateStreamToken, upsertStreamUser } from "../lib/stream.js";
import User from "../models/User.js";

export async function getStreamToken(req, res) {
  try {
    // Ensure current user exists in Stream
    const currentUser = await User.findById(req.user.id);
    if (currentUser) {
      await upsertStreamUser({
        id: currentUser._id.toString(),
        name: currentUser.fullName,
        image: currentUser.profilePic || "",
      });
    }

    const token = generateStreamToken(req.user.id);

    res.status(200).json({ token });
  } catch (error) {
    console.log("Error in getStreamToken controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function ensureChatUsers(req, res) {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }

    // Upsert both users in Stream (server-side with admin privileges)
    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(targetUserId)
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure both users exist in Stream
    await Promise.all([
      upsertStreamUser({
        id: currentUser._id.toString(),
        name: currentUser.fullName,
        image: currentUser.profilePic || "",
      }),
      upsertStreamUser({
        id: targetUser._id.toString(),
        name: targetUser.fullName,
        image: targetUser.profilePic || "",
      })
    ]);

    res.status(200).json({ success: true, message: "Users ensured in Stream" });
  } catch (error) {
    console.log("Error in ensureChatUsers controller:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
