import { auth, currentUser } from "@clerk/nextjs/server";
import React from "react";

const STRAPI_URL =
  process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

const checkUser = async () => {
  const user = await currentUser();

  if (!user) {
    console.log("No User found");
    return null;
  }

  if (!STRAPI_API_TOKEN) {
    console.error("Strapi API token is not defined");
    return null;
  }

  const {has} = await auth()
  const subscriptionTier = has({ plan: "pro"}) ? "pro" : "free";

  try {
    // Check if user exists in Strapi
    const exitsingUserResponse = await fetch(
      `${STRAPI_URL}/api/users?filters[clerkId][$eq]=${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${STRAPI_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!exitsingUserResponse.ok) {
      const errorText = await exitsingUserResponse.text();
      console.error("Strapi error response:", errorText);
      return null;
    }

    const existingUserData = await exitsingUserResponse.json();
    if (existingUserData.length > 0) {
      const existingUser = existingUserData[0];

      if (existingUser.subscriptionTier !== subscriptionTier) {
        // Update subscription tier if it has changed
        await fetch(`${STRAPI_URL}/api/users/${existingUser.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
          },
          body: JSON.stringify({
            subscriptionTier,
          }),
        });
      }

      return { ...existingUser, subscriptionTier };
    }

    // Get authentication roles from Strapi
    const rolesResponse = await fetch(
      `${STRAPI_URL}/api/users-permissions/roles`,
      {
        headers: {
          Authorization: `Bearer ${STRAPI_API_TOKEN}`,
        },
      },
    );

    const rolesData = await rolesResponse.json();
    const authenticatedRole = rolesData.roles.find(
      (role) => role.type === "authenticated",
    );

    if (!authenticatedRole) {
      console.error("Authenticated role not found in Strapi");
      return null;
    }

    // Create new user in Strapi
    const userData = {
        username: user.username || user.emailAddresses[0].emailAddress.split("@")[0],
        email: user.emailAddresses[0].emailAddress,
        password: `clerk_managed_${user.id}_${Date.now()}`,
        confirmed: true,
        blocked: false,
        role: authenticatedRole.id,

        clerkId: user.id,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        imageUrl: user.imageUrl || "",
        subscriptionTier,
    };

    const newUserResponse = await fetch(`${STRAPI_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify(userData),
    });

    if (!newUserResponse.ok) {
      const errorText = await newUserResponse.text();
      console.error("Failed to create user in Strapi:", errorText);
      return null;
    }
    const newUser = await newUserResponse.json();
    return newUser;

  } catch (error) {
    console.error("Error checking user in Strapi:", error);
  }

  return <div></div>;
};

export default checkUser;
