import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import config from './env';
import User, { IUserDocument } from '../models/User';
import { UserRole } from '../types';

passport.use(
    new GoogleStrategy(
        {
            clientID: config.google.clientId,
            clientSecret: config.google.clientSecret,
            callbackURL: config.google.callbackUrl,
            scope: ['profile', 'email'],
        },
        async (_accessToken, _refreshToken, profile: Profile, done) => {
            try {
                // Check if user already exists with this Google ID
                let user: any = await User.findOne({ googleId: profile.id });

                if (user) {
                    // User exists, return user
                    return done(null, user);
                }

                // Check if user exists with this email
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email found in Google profile'), undefined);
                }

                const emailUser = await User.findByEmail(email) as IUserDocument | null;

                if (emailUser) {
                    user = emailUser;
                    user.googleId = profile.id;
                    user.isEmailVerified = true;

                    if (profile.photos?.[0]?.value && !user.profileImage) {
                        user.profileImage = profile.photos[0].value;
                    }

                    await user.save();
                    return done(null, user);
                }

                // Create new user
                const newUser = await User.create({
                    email,
                    name: profile.displayName,
                    googleId: profile.id,
                    role: UserRole.STUDENT,
                    isEmailVerified: true,
                    profileImage: profile.photos?.[0]?.value,
                });

                return done(null, newUser);
            } catch (error) {
                return done(error as Error, undefined);
            }
        }
    )
);

// Serialize user for session
passport.serializeUser((user: any, done) => {
    done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

export default passport;