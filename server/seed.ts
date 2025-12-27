import { db } from "./db";
import { users, medicalDocuments, symptoms, sessions } from "@shared/schema";
import { hashPassword } from "./localAuth";
import { nanoid } from "nanoid";

// Demo user credentials
const DEMO_USER = {
  email: "demo@medivault.app",
  password: "demo123",
  firstName: "Sarah",
  lastName: "Johnson",
};

async function seed() {
  console.log("Seeding database...\n");

  // Clear existing data
  console.log("Clearing existing data...");
  await db.delete(symptoms);
  await db.delete(medicalDocuments);
  await db.delete(sessions);
  await db.delete(users);

  // Create demo user
  console.log("Creating demo user...");
  const userId = nanoid();
  const hashedPassword = hashPassword(DEMO_USER.password);

  await db.insert(users).values({
    id: userId,
    email: DEMO_USER.email,
    password: hashedPassword,
    firstName: DEMO_USER.firstName,
    lastName: DEMO_USER.lastName,
    profileImageUrl: null,
  });

  console.log(`\n  Demo User Created:`);
  console.log(`  Email: ${DEMO_USER.email}`);
  console.log(`  Password: ${DEMO_USER.password}`);
  console.log("");

  // Create medical documents (without actual files, just metadata)
  console.log("Creating medical documents...");
  const documentData = [
    {
      userId,
      title: "Annual Blood Work Results",
      description: "Complete blood count and metabolic panel from annual checkup",
      documentType: "lab_result",
      fileName: "blood_work_2024.pdf",
      filePath: "/uploads/blood_work_2024.pdf",
      fileSize: "245000",
      mimeType: "application/pdf",
      documentDate: "2024-11-15",
      doctorName: "Dr. Michael Chen",
      facilityName: "City Medical Center",
      tags: ["annual", "blood work", "checkup"],
    },
    {
      userId,
      title: "Chest X-Ray",
      description: "Routine chest x-ray, no abnormalities detected",
      documentType: "x_ray",
      fileName: "chest_xray_2024.jpg",
      filePath: "/uploads/chest_xray_2024.jpg",
      fileSize: "1850000",
      mimeType: "image/jpeg",
      documentDate: "2024-10-22",
      doctorName: "Dr. Emily Rodriguez",
      facilityName: "Radiology Associates",
      tags: ["x-ray", "chest", "routine"],
    },
    {
      userId,
      title: "Prescription - Vitamin D",
      description: "Vitamin D3 supplement prescription for deficiency",
      documentType: "prescription",
      fileName: "vitd_prescription.pdf",
      filePath: "/uploads/vitd_prescription.pdf",
      fileSize: "125000",
      mimeType: "application/pdf",
      documentDate: "2024-11-15",
      doctorName: "Dr. Michael Chen",
      facilityName: "City Medical Center",
      tags: ["prescription", "vitamins", "supplements"],
    },
    {
      userId,
      title: "Dermatology Consultation Notes",
      description: "Follow-up for skin check, all moles normal",
      documentType: "consultation",
      fileName: "derma_notes_2024.pdf",
      filePath: "/uploads/derma_notes_2024.pdf",
      fileSize: "98000",
      mimeType: "application/pdf",
      documentDate: "2024-09-10",
      doctorName: "Dr. Amanda Foster",
      facilityName: "Skin Health Clinic",
      tags: ["dermatology", "skin check", "consultation"],
    },
    {
      userId,
      title: "Lipid Panel Results",
      description: "Cholesterol and triglyceride levels - slightly elevated LDL",
      documentType: "lab_result",
      fileName: "lipid_panel_2024.pdf",
      filePath: "/uploads/lipid_panel_2024.pdf",
      fileSize: "156000",
      mimeType: "application/pdf",
      documentDate: "2024-11-15",
      doctorName: "Dr. Michael Chen",
      facilityName: "City Medical Center",
      tags: ["cholesterol", "lipid", "blood work"],
    },
    {
      userId,
      title: "Flu Vaccine Record",
      description: "Annual influenza vaccination",
      documentType: "other",
      fileName: "flu_vaccine_2024.pdf",
      filePath: "/uploads/flu_vaccine_2024.pdf",
      fileSize: "45000",
      mimeType: "application/pdf",
      documentDate: "2024-10-05",
      doctorName: "Nurse Patricia",
      facilityName: "QuickCare Pharmacy",
      tags: ["vaccine", "flu", "immunization"],
    },
    {
      userId,
      title: "Eye Exam Results",
      description: "Annual eye examination, prescription updated",
      documentType: "consultation",
      fileName: "eye_exam_2024.pdf",
      filePath: "/uploads/eye_exam_2024.pdf",
      fileSize: "178000",
      mimeType: "application/pdf",
      documentDate: "2024-08-20",
      doctorName: "Dr. James Wilson",
      facilityName: "Clear Vision Optometry",
      tags: ["eye exam", "vision", "optometry"],
    },
    {
      userId,
      title: "Thyroid Panel",
      description: "TSH and T4 levels within normal range",
      documentType: "lab_result",
      fileName: "thyroid_panel_2024.pdf",
      filePath: "/uploads/thyroid_panel_2024.pdf",
      fileSize: "134000",
      mimeType: "application/pdf",
      documentDate: "2024-07-12",
      doctorName: "Dr. Lisa Patel",
      facilityName: "Endocrine Specialists",
      tags: ["thyroid", "hormones", "blood work"],
    },
  ];

  for (const doc of documentData) {
    await db.insert(medicalDocuments).values(doc);
  }
  console.log(`Created ${documentData.length} medical documents`);

  // Create symptoms
  console.log("Creating symptom records...");
  const symptomData = [
    {
      userId,
      symptomName: "Headache",
      severity: 6,
      description: "Tension headache, pressure on both sides",
      location: "Head - temples",
      duration: "hours",
      triggers: ["stress", "lack of sleep"],
      medications: ["Ibuprofen 400mg"],
      notes: "Resolved after rest and medication",
      dateRecorded: "2024-12-20",
      timeOfDay: "afternoon",
    },
    {
      userId,
      symptomName: "Lower Back Pain",
      severity: 4,
      description: "Dull ache after sitting for long periods",
      location: "Lower back",
      duration: "days",
      triggers: ["prolonged sitting", "poor posture"],
      medications: [],
      notes: "Improved with stretching exercises",
      dateRecorded: "2024-12-18",
      timeOfDay: "evening",
    },
    {
      userId,
      symptomName: "Fatigue",
      severity: 5,
      description: "Feeling tired despite adequate sleep",
      location: "General",
      duration: "days",
      triggers: ["work stress"],
      medications: ["Vitamin B12"],
      notes: "May be related to vitamin D deficiency",
      dateRecorded: "2024-12-15",
      timeOfDay: "morning",
    },
    {
      userId,
      symptomName: "Seasonal Allergies",
      severity: 3,
      description: "Sneezing, runny nose, itchy eyes",
      location: "Nose, Eyes",
      duration: "days",
      triggers: ["pollen", "dust"],
      medications: ["Cetirizine 10mg"],
      notes: "Annual occurrence, manageable with antihistamines",
      dateRecorded: "2024-12-10",
      timeOfDay: "morning",
    },
    {
      userId,
      symptomName: "Heartburn",
      severity: 4,
      description: "Burning sensation in chest after eating",
      location: "Chest - center",
      duration: "hours",
      triggers: ["spicy food", "large meals"],
      medications: ["Antacid"],
      notes: "Avoid eating late at night",
      dateRecorded: "2024-12-08",
      timeOfDay: "night",
    },
    {
      userId,
      symptomName: "Headache",
      severity: 7,
      description: "Migraine with light sensitivity",
      location: "Head - left side",
      duration: "hours",
      triggers: ["bright lights", "stress"],
      medications: ["Sumatriptan"],
      notes: "Had to rest in dark room for 2 hours",
      dateRecorded: "2024-12-05",
      timeOfDay: "afternoon",
    },
    {
      userId,
      symptomName: "Muscle Soreness",
      severity: 3,
      description: "Post-workout muscle aches",
      location: "Legs - quadriceps",
      duration: "days",
      triggers: ["exercise"],
      medications: [],
      notes: "Normal DOMS after leg day",
      dateRecorded: "2024-12-01",
      timeOfDay: "evening",
    },
    {
      userId,
      symptomName: "Insomnia",
      severity: 5,
      description: "Difficulty falling asleep",
      location: "General",
      duration: "hours",
      triggers: ["caffeine", "screen time"],
      medications: ["Melatonin 3mg"],
      notes: "Need to reduce evening screen time",
      dateRecorded: "2024-11-28",
      timeOfDay: "night",
    },
    {
      userId,
      symptomName: "Dry Eyes",
      severity: 2,
      description: "Eyes feel dry and irritated",
      location: "Eyes",
      duration: "hours",
      triggers: ["screen time", "dry air"],
      medications: ["Artificial tears"],
      notes: "Using eye drops regularly helps",
      dateRecorded: "2024-11-25",
      timeOfDay: "afternoon",
    },
    {
      userId,
      symptomName: "Neck Stiffness",
      severity: 4,
      description: "Stiff neck upon waking",
      location: "Neck - right side",
      duration: "hours",
      triggers: ["sleeping position"],
      medications: [],
      notes: "Need to check pillow height",
      dateRecorded: "2024-11-20",
      timeOfDay: "morning",
    },
  ];

  for (const symptom of symptomData) {
    await db.insert(symptoms).values(symptom);
  }
  console.log(`Created ${symptomData.length} symptom records`);

  console.log("\n========================================");
  console.log("  Database seeded successfully!");
  console.log("========================================");
  console.log("\n  Login credentials:");
  console.log(`  Email:    ${DEMO_USER.email}`);
  console.log(`  Password: ${DEMO_USER.password}`);
  console.log("\n========================================\n");

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
