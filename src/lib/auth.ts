import { auth, currentUser } from '@clerk/nextjs/server';
import { syncUserFromClerk } from './db';

export async function getCurrentUser() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return null;
    }
    
    const clerkUser = await currentUser();
    
    if (!clerkUser) {
      return null;
    }
    
    // Sync user to database if needed
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (email) {
      try {
        const dbUser = await syncUserFromClerk(userId, email);
        return {
          id: dbUser.id,
          clerkId: dbUser.clerkId,
          email: dbUser.email,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
        };
      } catch (error) {
        console.error('Failed to sync user:', error);
        // Return partial user data even if DB sync fails
        return {
          id: userId,
          clerkId: userId,
          email,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  return user;
}