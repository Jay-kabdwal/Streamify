import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

export async function getRecommendedUsers(req, res) {
  try {
    const currentUserId = req.user.id;
    const currentUser = req.user;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      $and: [
        { _id: { $ne: currentUserId } }, //exclude current user
        { _id: { $nin: currentUser.friends } }, // exclude current user's friends
        { isOnboarded: true },
      ],
    };

    // Get total count for pagination metadata
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    const recommendedUsers = await User.find(query)
      .skip(skip)
      .limit(limit)
      .select("fullName profilePic nativeLanguage learningLanguage location bio");

    res.status(200).json({
      users: recommendedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in getRecommendedUsers controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getMyFriends(req, res) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id).select("friends");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const totalFriends = user.friends.length;
    const totalPages = Math.ceil(totalFriends / limit);

    // Get paginated friends with populated data
    const paginatedUser = await User.findById(req.user.id)
      .select("friends")
      .populate({
        path: "friends",
        select: "fullName profilePic nativeLanguage learningLanguage location bio",
        options: {
          skip: skip,
          limit: limit,
        },
      });

    res.status(200).json({
      friends: paginatedUser.friends,
      pagination: {
        currentPage: page,
        totalPages,
        totalFriends,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error in getMyFriends controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function sendFriendRequest(req, res) {
  try {
    const myId = req.user.id;
    const { id: recipientId } = req.params;

    // prevent sending req to yourself
    if (myId === recipientId) {
      return res.status(400).json({ message: "You can't send friend request to yourself" });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    // check if user is already friends
    if (recipient.friends.includes(myId)) {
      return res.status(400).json({ message: "You are already friends with this user" });
    }

    // check if a req already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: myId, recipient: recipientId },
        { sender: recipientId, recipient: myId },
      ],
    });

    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "A friend request already exists between you and this user" });
    }

    const friendRequest = await FriendRequest.create({
      sender: myId,
      recipient: recipientId,
    });

    res.status(201).json(friendRequest);
  } catch (error) {
    console.error("Error in sendFriendRequest controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function acceptFriendRequest(req, res) {
  try {
    const { id: requestId } = req.params;

    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    // Verify the current user is the recipient
    if (friendRequest.recipient.toString() !== req.user.id) {
      return res.status(403).json({ message: "You are not authorized to accept this request" });
    }

    friendRequest.status = "accepted";
    await friendRequest.save();

    // add each user to the other's friends array
    // $addToSet: adds elements to an array only if they do not already exist.
    await User.findByIdAndUpdate(friendRequest.sender, {
      $addToSet: { friends: friendRequest.recipient },
    });

    await User.findByIdAndUpdate(friendRequest.recipient, {
      $addToSet: { friends: friendRequest.sender },
    });

    res.status(200).json({ message: "Friend request accepted" });
  } catch (error) {
    console.log("Error in acceptFriendRequest controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getFriendRequests(req, res) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get incoming requests with pagination
    const incomingQuery = {
      recipient: req.user.id,
      status: "pending",
    };
    const totalIncoming = await FriendRequest.countDocuments(incomingQuery);
    const incomingReqs = await FriendRequest.find(incomingQuery)
      .skip(skip)
      .limit(limit)
      .populate("sender", "fullName profilePic nativeLanguage learningLanguage")
      .sort({ createdAt: -1 });

    // Get accepted requests with pagination
    const acceptedQuery = {
      sender: req.user.id,
      status: "accepted",
    };
    const totalAccepted = await FriendRequest.countDocuments(acceptedQuery);
    const acceptedReqs = await FriendRequest.find(acceptedQuery)
      .skip(skip)
      .limit(limit)
      .populate("recipient", "fullName profilePic")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      incomingReqs: {
        requests: incomingReqs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalIncoming / limit),
          totalRequests: totalIncoming,
          hasNextPage: page < Math.ceil(totalIncoming / limit),
          hasPrevPage: page > 1,
        },
      },
      acceptedReqs: {
        requests: acceptedReqs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalAccepted / limit),
          totalRequests: totalAccepted,
          hasNextPage: page < Math.ceil(totalAccepted / limit),
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.log("Error in getPendingFriendRequests controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getOutgoingFriendReqs(req, res) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      sender: req.user.id,
      status: "pending",
    };

    const totalRequests = await FriendRequest.countDocuments(query);
    const totalPages = Math.ceil(totalRequests / limit);

    const outgoingRequests = await FriendRequest.find(query)
      .skip(skip)
      .limit(limit)
      .populate("recipient", "fullName profilePic nativeLanguage learningLanguage")
      .sort({ createdAt: -1 });

    res.status(200).json({
      requests: outgoingRequests,
      pagination: {
        currentPage: page,
        totalPages,
        totalRequests,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.log("Error in getOutgoingFriendReqs controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
