import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, Mail } from "lucide-react";
import analytics from "@/lib/analytics/umami";

const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().optional(),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

interface WaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: string;
}

export default function WaitlistModal({ open, onOpenChange, source = 'unknown' }: WaitlistModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setIsSuccess(false);
        setError(null);
        form.reset();
      }, 300);
    }
  }, [open, form]);

  const onSubmit = async (data: WaitlistFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          source,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to join waitlist" }));
        throw new Error(errorData.message || "Failed to join waitlist");
      }

      // Track successful signup
      analytics.ctaClicked('waitlist_joined', source);

      setIsSuccess(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(errorMessage);

      // Track failure
      analytics.errorOccurred('waitlist_signup_failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a2e] border-white/30 max-w-md shadow-2xl backdrop-blur-xl">
        {isSuccess ? (
          <div className="text-center py-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30">
                <CheckCircle className="h-12 w-12 text-primary" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-3">You're on the list!</h3>
            <p className="text-foreground-muted mb-6 leading-relaxed">
              We'll notify you when MediVault launches. Get ready to transform how you manage your health data.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary">
                  <Mail className="h-6 w-6 text-white" />
                </div>
              </div>
              <DialogTitle className="text-foreground text-2xl text-center">
                Join the Waitlist
              </DialogTitle>
              <DialogDescription className="text-foreground-muted text-center">
                Be among the first to experience AI-powered health intelligence. We'll notify you when we launch.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          type="email"
                          className="bg-[#0f0f1e] border-white/30 text-foreground focus:border-primary/50 focus:ring-primary/20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John"
                          className="bg-[#0f0f1e] border-white/30 text-foreground focus:border-primary/50 focus:ring-primary/20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Last Name (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Doe"
                          className="bg-[#0f0f1e] border-white/30 text-foreground focus:border-primary/50 focus:ring-primary/20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Waitlist"
                  )}
                </Button>

                <p className="text-xs text-center text-foreground-muted">
                  We'll only use your email to notify you about MediVault's launch. No spam, ever.
                </p>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
