export type RoomType = 'deluxe' | 'royal' | 'king' | 'mini' | 'executive' | 'diplomatic';


export interface Room {
 id: string;
 number: string;
 type: string;
 floor: number;
 rate: number;
 capacity: number;
 amenities: string[];
 status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'reserved';
 currentGuest?: number;
 lastCleaned?: string;
 nextReservation?: string;
 roomType: RoomType;
}


export const roomTypeDetails = {
 deluxe: {
   name: 'Deluxe Room',
   rate: 15000,
   capacity: 2,
   amenities: ['King Bed', 'City View', 'Mini Bar', 'WiFi', 'TV', 'AC', 'Coffee Maker']
 },
 royal: {
   name: 'Royal Suite',
   rate: 35000,
   capacity: 3,
   amenities: ['King Bed', 'Ocean View', 'Jacuzzi', 'Mini Bar', 'WiFi', 'TV', 'AC', 'Butler Service', 'Lounge Access']
 },
 king: {
   name: 'King Suite',
   rate: 25000,
   capacity: 2,
   amenities: ['King Bed', 'Sea View', 'Living Area', 'Mini Bar', 'WiFi', 'TV', 'AC', 'Work Desk']
 },
 mini: {
   name: 'Mini Suite',
   rate: 20000,
   capacity: 2,
   amenities: ['Queen Bed', 'City View', 'Sitting Area', 'Mini Bar', 'WiFi', 'TV', 'AC']
 },
 executive: {
   name: 'Executive Suite',
   rate: 45000,
   capacity: 4,
   amenities: ['2 Queen Beds', 'Panoramic View', 'Kitchenette', 'Dining Area', 'Mini Bar', 'WiFi', 'TV', 'AC', 'Executive Lounge']
 },
 diplomatic: {
   name: 'Diplomatic Suite',
   rate: 75000,
   capacity: 6,
   amenities: ['2 King Beds', 'Presidential View', 'Full Kitchen', 'Dining Room', 'Meeting Room', 'Jacuzzi', 'Mini Bar', 'WiFi', 'TV', 'AC', 'Private Butler']
 }
};


export const getRoomNumbers = (roomType: RoomType): string[] => {
 const roomTypes = {
   deluxe: [
     101, 102, 103, 104, 105, 106, 107, 201, 202, 207, 208, 219, 220, 225, 227,
     228, 301, 302, 308, 309, 319, 218, 320, 321, 327, 328, 329,
   ].map(String),
   royal: [
     203, 205, 206, 210, 212, 214, 215, 221, 222, 224, 226, 303, 304, 306, 307,
     310, 313, 316, 317, 314, 322, 323, 325, 326,
   ].map(String),
   king: [209, 211, 216, 217, 311, 312, 315, 318].map(String),
   mini: [223, 305, 324].map(String),
   executive: [213].map(String),
   diplomatic: [204].map(String),
 };


 return roomTypes[roomType] || [];
};


export const generateRooms = (count?: number): Room[] => {
 const rooms: Room[] = [];
  // Generate all rooms by type
 const roomTypes: RoomType[] = ['deluxe', 'royal', 'king', 'mini', 'executive', 'diplomatic'];
  roomTypes.forEach(roomType => {
   const roomNumbers = getRoomNumbers(roomType);
   const details = roomTypeDetails[roomType];
  
   roomNumbers.forEach((number, index) => {
     // Determine floor from room number
     const floor = parseInt(number[0]);
    
     // Random status distribution
     const statusRand = Math.random();
     let status: Room['status'];
     if (statusRand < 0.4) {
       status = 'available';
     } else if (statusRand < 0.65) {
       status = 'occupied';
     } else if (statusRand < 0.8) {
       status = 'reserved';
     } else if (statusRand < 0.9) {
       status = 'cleaning';
     } else {
       status = 'maintenance';
     }
    
     const today = new Date();
     let lastCleaned;
     let nextReservation;
    
     if (status === 'cleaning' || status === 'available' || status === 'occupied') {
       lastCleaned = new Date(today);
       lastCleaned.setHours(today.getHours() - Math.floor(Math.random() * 24));
       lastCleaned = lastCleaned.toISOString();
     }
    
     if (status === 'reserved') {
       nextReservation = new Date(today);
       nextReservation.setDate(today.getDate() + Math.floor(Math.random() * 7) + 1);
       nextReservation = nextReservation.toISOString().split('T')[0];
     }
    
     rooms.push({
       id: `room-${number}`,
       number,
       type: details.name,
       floor,
       rate: details.rate,
       capacity: details.capacity,
       amenities: details.amenities,
       status,
       lastCleaned,
       nextReservation,
       roomType
     });
   });
 });
  // If count is specified, return only that many rooms
 if (count) {
   return rooms.slice(0, count);
 }
  return rooms;
};


export const organizations = [
 "Tech Corp",
 "Global Industries",
 "First Bank",
 "Telecom NG",
 "Oil & Gas Ltd",
 "Consulting Pro",
 "Hotel Group",
 "Insurance Co",
 "Real Estate Inc",
 "Logistics Plus",
 "Construction Ltd",
 "Pharma Corp",
 "Retail Solutions",
 "Energy Partners",
 "Media House"
];


export const paymentModes = [
 'Cash',
 'Card',
 'Mobile Money',
 'Bank Transfer',
 'Corporate Account',
 'Voucher',
 'Crypto'
];


export const guestPreferences = [
 'High Floor',
 'Low Floor',
 'Extra Pillows',
 'Extra Towels',
 'Non-Smoking',
 'Smoking',
 'King Bed',
 'Twin Beds',
 'Connecting Room',
 'Early Check-in',
 'Late Check-out',
 'Quiet Room',
 'Sea View',
 'City View',
 'Accessible Room',
 'Baby Cot',
 'Extra Bed',
 'Champagne on Arrival',
 'Fruit Basket',
 'Welcome Drink'
];


export interface Guest {
 id: number;
 name: string;
 phone: string;
 email: string;
 checkIn: string;
 checkOut: string;
 nights: number;
 room: string;
 type: string;
 rate: number;
 status: 'reserved' | 'checked_in' | 'checked_out' | 'no_show' | 'cancelled';
 payment: 'paid' | 'partial' | 'pending' | 'cancelled';
 paymentMode?: string;
 amount: number;
 paid: number;
 balance: number;
 extended?: boolean;
 guestType: 'walkin' | 'reservation' | 'organization';
 organization?: string;
 deposit?: number;
 paymentDate?: string;
 paymentHistory?: Payment[];
 preferences?: string[];
 vip?: boolean;
 loyaltyTier?: 'bronze' | 'silver' | 'gold' | 'platinum';
 totalStays?: number;
 lastStay?: string;
 idVerified?: boolean;
 idType?: string;
 idNumber?: string;
 specialRequests?: string[];
 createdAt: string;
 updatedAt?: string;
}


export interface Payment {
 id: number;
 guestId: number;
 date: string;
 amount: number;
 method: string;
 reference?: string;
 notes?: string;
 receivedBy?: string;
}


export interface Activity {
 id: number;
 guestId: number;
 type: 'reservation' | 'payment' | 'checkin' | 'checkout' | 'charge' | 'extension' | 'cancellation' | 'no_show' | 'organization' | 'deposit' | 'refund' | 'upgrade' | 'complimentary' | 'adjustment';
 subType?: 'food' | 'beverage' | 'laundry' | 'minibar' | 'room_service' | 'spa' | 'transport' | 'internet' | 'phone' | 'breakfast' | 'late_checkout' | 'extra_bed' | 'parking' | 'business';
 date: string;
 description: string;
 details: string;
 amount: number;
 balance: number;
 status: 'pending' | 'completed' | 'cancelled';
 user: string;
 department?: string;
 paymentMethod?: string;
 organization?: string;
 previousCheckout?: string;
 newCheckout?: string;
 reason?: string;
}


export const generateEnhancedMockGuests = (count: number = 30): Guest[] => {
 const guests: Guest[] = [];
  const firstNames = [
   "John", "Sarah", "Michael", "Emily", "David", "Jennifer", "Robert", "Lisa",
   "James", "Patricia", "Thomas", "Nancy", "Kevin", "Sandra", "George", "Betty",
   "Edward", "Helen", "Frank", "Diana", "Peter", "Amy", "Brian", "Carol",
   "Daniel", "Eva", "Gary", "Hannah", "Ian", "Julia", "Oluwaseun", "Adebayo",
   "Chidinma", "Emeka", "Fatima", "Musa", "Ngozi", "Tunde", "Zainab", "Kofi",
   "Grace", "Henry", "Irene", "Jack", "Kelly", "Leo", "Martha", "Nathan"
 ];
  const lastNames = [
   "Smith", "Johnson", "Brown", "Davis", "Wilson", "Lee", "Taylor", "Anderson",
   "Martin", "White", "Clark", "Hall", "Young", "King", "Wright", "Lopez",
   "Hill", "Scott", "Green", "Adams", "Baker", "Carter", "Evans", "Foster",
   "Harris", "Mitchell", "Nelson", "Perez", "Roberts", "Turner", "Okafor",
   "Adebayo", "Okonkwo", "Abubakar", "Suleiman", "Eze", "Nwachukwu", "Ogunleye",
   "Williams", "Thompson", "Walker", "Allen", "Robinson", "Lewis"
 ];
  const roomTypes = ["Standard", "Deluxe", "Executive", "Suite", "Presidential"];
 const roomRates = [12000, 15000, 25000, 35000, 75000];
  // Get all available rooms
 const allRooms = generateRooms();
 const availableRooms = allRooms.map(room => room.number);
  const statuses: Guest['status'][] = ['reserved', 'checked_in', 'checked_out', 'no_show', 'cancelled'];
 const paymentStatuses: Guest['payment'][] = ['paid', 'partial', 'pending', 'cancelled'];
  // Generate guests
 for (let i = 0; i < count; i++) {
   const id = i + 1;
   const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
   const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
   const name = `${firstName} ${lastName}`;
  
   const phone = `0${Math.floor(Math.random() * 900000000) + 700000000}`;
   const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
  
   // Guest type distribution
   const guestTypeRand = Math.random();
   let guestType: Guest['guestType'];
   if (guestTypeRand < 0.4) {
     guestType = 'walkin';
   } else if (guestTypeRand < 0.8) {
     guestType = 'reservation';
   } else {
     guestType = 'organization';
   }
  
   const today = new Date();
   let checkIn: Date;
   let checkOut: Date;
   let status: Guest['status'];
   let extended = false;
  
   if (guestType === 'reservation') {
     checkIn = new Date(today);
     checkIn.setDate(today.getDate() + Math.floor(Math.random() * 14) + 1);
     status = 'reserved';
   } else if (guestType === 'walkin') {
     const statusRand = Math.random();
     if (statusRand < 0.5) {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() - Math.floor(Math.random() * 5) - 1);
       status = 'checked_in';
       if (Math.random() < 0.3) extended = true;
     } else if (statusRand < 0.8) {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() - Math.floor(Math.random() * 10) - 3);
       status = 'checked_out';
     } else {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() - Math.floor(Math.random() * 5) - 1);
       status = Math.random() < 0.5 ? 'no_show' : 'cancelled';
     }
   } else {
     const statusRand = Math.random();
     if (statusRand < 0.4) {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() - Math.floor(Math.random() * 5) - 1);
       status = 'checked_in';
     } else if (statusRand < 0.7) {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() + Math.floor(Math.random() * 7) + 1);
       status = 'reserved';
     } else {
       checkIn = new Date(today);
       checkIn.setDate(today.getDate() - Math.floor(Math.random() * 10) - 3);
       status = 'checked_out';
     }
   }
  
   const nights = Math.floor(Math.random() * 7) + 1;
   if (extended) {
     checkOut = new Date(checkIn);
     checkOut.setDate(checkOut.getDate() + nights + Math.floor(Math.random() * 3) + 1);
   } else {
     checkOut = new Date(checkIn);
     checkOut.setDate(checkOut.getDate() + nights);
   }
  
   // Assign room
   const roomIndex = Math.floor(Math.random() * availableRooms.length);
   const roomNumber = availableRooms[roomIndex];
   const roomTypeIndex = Math.floor(Math.random() * roomTypes.length);
   const roomType = roomTypes[roomTypeIndex];
   const rate = roomRates[roomTypeIndex];
  
   const totalAmount = rate * nights;
   let paid = 0;
   let balance = 0;
   let payment: Guest['payment'];
   let paymentMode = paymentModes[Math.floor(Math.random() * paymentModes.length)];
   let deposit = 0;
   let organization: string | undefined;
   let paymentDate: string | undefined;
  
   // Payment logic
   if (status === 'cancelled' || status === 'no_show') {
     payment = 'cancelled';
     paid = 0;
     balance = 0;
   } else if (status === 'reserved') {
     const paymentRand = Math.random();
     if (paymentRand < 0.3) {
       payment = 'paid';
       paid = totalAmount;
       balance = 0;
       paymentDate = new Date().toISOString().split('T')[0];
     } else if (paymentRand < 0.5) {
       payment = 'partial';
       paid = Math.floor(totalAmount * (Math.random() * 0.5 + 0.2));
       balance = totalAmount - paid;
       paymentDate = new Date().toISOString().split('T')[0];
     } else {
       payment = 'pending';
       paid = 0;
       balance = totalAmount;
     }
   } else if (status === 'checked_in') {
     const paymentRand = Math.random();
     if (paymentRand < 0.4) {
       payment = 'paid';
       paid = totalAmount;
       balance = 0;
       paymentDate = new Date().toISOString().split('T')[0];
     } else if (paymentRand < 0.8) {
       payment = 'partial';
       paid = Math.floor(totalAmount * (Math.random() * 0.6 + 0.1));
       balance = totalAmount - paid;
       paymentDate = new Date().toISOString().split('T')[0];
      
       if (Math.random() < 0.3) {
         deposit = Math.floor(totalAmount * 0.2);
       }
     } else {
       payment = 'pending';
       paid = 0;
       balance = totalAmount;
      
       if (Math.random() < 0.4) {
         deposit = Math.floor(totalAmount * 0.15);
       }
     }
   } else {
     payment = 'paid';
     paid = totalAmount;
     balance = 0;
     paymentDate = checkOut.toISOString().split('T')[0];
   }
  
   if (guestType === 'organization') {
     organization = organizations[Math.floor(Math.random() * organizations.length)];
     paymentMode = 'Corporate Account';
    
     if (status === 'checked_in' || status === 'reserved') {
       const paymentRand = Math.random();
       if (paymentRand < 0.6) {
         payment = 'pending';
         paid = 0;
         balance = totalAmount;
       } else if (paymentRand < 0.8) {
         payment = 'partial';
         paid = Math.floor(totalAmount * 0.5);
         balance = totalAmount - paid;
       } else {
         payment = 'paid';
         paid = totalAmount;
         balance = 0;
       }
     }
   }
  
   // Create payment history
   const paymentHistory: Payment[] = [];
   if (paid > 0) {
     paymentHistory.push({
       id: id * 100 + 1,
       guestId: id,
       date: paymentDate || new Date().toISOString().split('T')[0],
       amount: paid,
       method: paymentMode,
       reference: `TXN${Math.floor(Math.random() * 1000000)}`,
       receivedBy: ['Sarah (Front Desk)', 'John (Front Desk)', 'Mary (Front Desk)'][Math.floor(Math.random() * 3)]
     });
   }
  
   if (deposit && deposit > 0) {
     paymentHistory.push({
       id: id * 100 + 2,
       guestId: id,
       date: new Date().toISOString().split('T')[0],
       amount: deposit,
       method: 'Card',
       reference: `DEP${Math.floor(Math.random() * 1000000)}`,
       notes: 'Security deposit',
       receivedBy: 'Sarah (Front Desk)'
     });
   }
  
   // Random preferences
   const numPreferences = Math.floor(Math.random() * 4);
   const preferences: string[] = [];
   for (let p = 0; p < numPreferences; p++) {
     const pref = guestPreferences[Math.floor(Math.random() * guestPreferences.length)];
     if (!preferences.includes(pref)) {
       preferences.push(pref);
     }
   }
  
   // Random special requests
   const specialRequests: string[] = [];
   if (Math.random() > 0.7) {
     specialRequests.push('Extra pillows');
   }
   if (Math.random() > 0.8) {
     specialRequests.push('Late check-out requested');
   }
   if (Math.random() > 0.9) {
     specialRequests.push('Anniversary celebration');
   }
  
   guests.push({
     id,
     name,
     phone,
     email,
     checkIn: checkIn.toISOString().split('T')[0],
     checkOut: checkOut.toISOString().split('T')[0],
     nights: extended ? nights + (checkOut.getDate() - checkIn.getDate() - nights) : nights,
     room: roomNumber,
     type: roomType,
     rate,
     status,
     payment,
     paymentMode,
     amount: totalAmount,
     paid,
     balance,
     extended,
     guestType,
     organization,
     deposit,
     paymentDate,
     paymentHistory,
     preferences,
     vip: Math.random() > 0.8,
     loyaltyTier: ['bronze', 'silver', 'gold', 'platinum'][Math.floor(Math.random() * 4)] as any,
     totalStays: Math.floor(Math.random() * 10) + 1,
     lastStay: new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
     idVerified: Math.random() > 0.3,
     idType: ['Passport', "Driver's License", 'National ID'][Math.floor(Math.random() * 3)],
     idNumber: `${Math.random() > 0.5 ? 'A' : 'B'}${Math.floor(Math.random() * 10000000)}`,
     specialRequests,
     createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
   });
 }
  return guests.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());
};


export const generateMockActivities = (guestId: number, guestName: string, guestType: string): Activity[] => {
 const activities: Activity[] = [];
 const today = new Date();
 const users = ['Sarah (Front Desk)', 'John (Front Desk)', 'Michael (Waiter)', 'Lisa (Bartender)', 'Mary (Housekeeping)'];
  if (guestType === 'reservation') {
   activities.push({
     id: guestId * 100 + 1,
     guestId,
     type: 'reservation',
     date: new Date(today.setDate(today.getDate() - 2)).toISOString(),
     description: 'Reservation created',
     details: `Online booking - ${guestName}`,
     amount: 0,
     balance: 0,
     status: 'completed',
     user: 'System',
     department: 'RESERVATIONS'
   });
  
   if (Math.random() > 0.5) {
     activities.push({
       id: guestId * 100 + 2,
       guestId,
       type: 'payment',
       date: new Date(today.setDate(today.getDate() - 1)).toISOString(),
       description: 'Deposit payment',
       details: '25% deposit paid via card',
       amount: -25000,
       balance: 75000,
       status: 'completed',
       user: users[Math.floor(Math.random() * users.length)],
       paymentMethod: 'Card',
       department: 'FRONT_DESK'
     });
   }
 } else if (guestType === 'walkin') {
   activities.push({
     id: guestId * 100 + 1,
     guestId,
     type: 'checkin',
     date: new Date().toISOString(),
     description: 'Walk-in check-in',
     details: 'Guest checked in without reservation',
     amount: 0,
     balance: 0,
     status: 'completed',
     user: users[Math.floor(Math.random() * users.length)],
     department: 'FRONT_DESK'
   });
  
   if (Math.random() > 0.3) {
     activities.push({
       id: guestId * 100 + 2,
       guestId,
       type: 'charge',
       subType: 'food',
       date: new Date().toISOString(),
       description: 'Restaurant charge',
       details: 'Dinner - Grilled Fish, Rice, Wine',
       amount: 12500,
       balance: 12500,
       status: 'pending',
       user: users[Math.floor(Math.random() * users.length)],
       department: 'F&B',
       paymentMethod: 'POST_TO_ROOM'
     });
   }
 } else if (guestType === 'organization') {
   activities.push({
     id: guestId * 100 + 1,
     guestId,
     type: 'organization',
     date: new Date(today.setDate(today.getDate() - 3)).toISOString(),
     description: 'Corporate booking',
     details: 'Billed to organization account',
     amount: 0,
     balance: 75000,
     status: 'completed',
     user: users[Math.floor(Math.random() * users.length)],
     organization: organizations[Math.floor(Math.random() * organizations.length)],
     department: 'CORPORATE_SALES'
   });
 }
  return activities;
};


export const mockGuests = generateEnhancedMockGuests(30);


export const mockActivities: Activity[] = [
 {
   id: 1,
   guestId: 1,
   type: "reservation",
   date: "2024-03-10T10:30:00",
   description: "Room 101 - Deluxe - 3 nights",
   details: "Check-in: Mar 15, 2024 | Check-out: Mar 18, 2024",
   amount: 45000,
   balance: 45000,
   status: "pending",
   user: "Sarah (Front Desk)",
   paymentMethod: "CASH",
 },
 {
   id: 2,
   guestId: 1,
   type: "payment",
   date: "2024-03-10T10:35:00",
   description: "Reservation payment",
   details: "Cash payment received",
   amount: -45000,
   balance: 0,
   status: "completed",
   user: "Sarah (Front Desk)",
   paymentMethod: "CASH",
 },
 {
   id: 3,
   guestId: 6,
   type: "checkin",
   date: "2024-03-10T14:20:00",
   description: "Guest checked in",
   details: "Room 101 assigned | ID verified",
   amount: 0,
   balance: 0,
   status: "completed",
   user: "John (Front Desk)",
 },
 {
   id: 4,
   guestId: 6,
   type: "charge",
   subType: "food",
   date: "2024-03-10T19:45:00",
   description: "Dinner - Restaurant",
   details: "2 x Grilled Chicken, 2 x Wine, 1 x Dessert",
   amount: 8500,
   balance: 8500,
   status: "pending",
   user: "Waiter - Michael",
   department: "F&B",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 5,
   guestId: 6,
   type: "charge",
   subType: "beverage",
   date: "2024-03-10T22:15:00",
   description: "Bar tab",
   details: "3 x Cocktails, 2 x Beer",
   amount: 4200,
   balance: 12700,
   status: "pending",
   user: "Bartender - Lisa",
   department: "F&B",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 6,
   guestId: 6,
   type: "charge",
   subType: "laundry",
   date: "2024-03-11T09:30:00",
   description: "Laundry service",
   details: "2 x Shirts, 1 x Suit (Express)",
   amount: 3500,
   balance: 16200,
   status: "pending",
   user: "Housekeeping - Mary",
   department: "LAUNDRY",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 7,
   guestId: 6,
   type: "payment",
   date: "2024-03-11T11:20:00",
   description: "Partial payment",
   details: "Paid against room charges",
   amount: -10000,
   balance: 6200,
   status: "completed",
   user: "Sarah (Front Desk)",
   paymentMethod: "CARD",
 },
 {
   id: 8,
   guestId: 7,
   type: "charge",
   subType: "minibar",
   date: "2024-03-11T15:40:00",
   description: "Minibar",
   details: "2 x Water, 1 x Soda, 1 x Chocolate",
   amount: 1800,
   balance: 1800,
   status: "pending",
   user: "Housekeeping - Mary",
   department: "MINIBAR",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 9,
   guestId: 8,
   type: "charge",
   subType: "room_service",
   date: "2024-03-12T20:00:00",
   description: "Room service - Dinner",
   details: "Caesar Salad, Steak, Wine",
   amount: 6500,
   balance: 6500,
   status: "pending",
   user: "Room Service - David",
   department: "F&B",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 10,
   guestId: 9,
   type: "extension",
   date: "2024-03-12T21:15:00",
   description: "Extended stay",
   details: "Added 2 nights | New checkout: Mar 17, 2024",
   amount: 30000,
   balance: 30000,
   status: "completed",
   user: "John (Front Desk)",
   previousCheckout: "2024-03-15",
   newCheckout: "2024-03-17",
 },
 {
   id: 11,
   guestId: 10,
   type: "charge",
   subType: "spa",
   date: "2024-03-13T11:00:00",
   description: "Spa treatment",
   details: "Massage - 60 minutes",
   amount: 5500,
   balance: 5500,
   status: "pending",
   user: "Spa - Anna",
   department: "SPA",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 12,
   guestId: 11,
   type: "charge",
   subType: "transport",
   date: "2024-03-14T14:30:00",
   description: "Airport transfer",
   details: "One way - SUV",
   amount: 4000,
   balance: 4000,
   status: "pending",
   user: "Concierge - Peter",
   department: "TRANSPORT",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 13,
   guestId: 12,
   type: "payment",
   date: "2024-03-14T16:45:00",
   description: "Partial payment",
   details: "Paid against room charges",
   amount: -20000,
   balance: 20000,
   status: "completed",
   user: "Sarah (Front Desk)",
   paymentMethod: "MOBILE_MONEY",
 },
 {
   id: 14,
   guestId: 13,
   type: "charge",
   subType: "internet",
   date: "2024-03-15T18:00:00",
   description: "Premium internet",
   details: "High-speed access - 3 days",
   amount: 1500,
   balance: 1500,
   status: "pending",
   user: "System",
   department: "INTERNET",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 15,
   guestId: 14,
   type: "charge",
   subType: "phone",
   date: "2024-03-15T09:15:00",
   description: "International call",
   details: "USA - 15 minutes",
   amount: 2200,
   balance: 2200,
   status: "pending",
   user: "System",
   department: "TELEPHONE",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 16,
   guestId: 15,
   type: "charge",
   subType: "breakfast",
   date: "2024-03-16T08:30:00",
   description: "Breakfast buffet",
   details: "2 persons",
   amount: 2400,
   balance: 2400,
   status: "pending",
   user: "Restaurant - James",
   department: "F&B",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 17,
   guestId: 16,
   type: "charge",
   subType: "late_checkout",
   date: "2024-03-16T12:30:00",
   description: "Late checkout fee",
   details: "Checked out at 2:00 PM",
   amount: 5000,
   balance: 5000,
   status: "pending",
   user: "John (Front Desk)",
   department: "ROOM",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 18,
   guestId: 17,
   type: "checkout",
   date: "2024-03-16T14:00:00",
   description: "Guest checked out",
   details: "Room 444 | Stayed 5 nights",
   amount: 0,
   balance: 75000,
   status: "pending",
   user: "John (Front Desk)",
 },
 {
   id: 19,
   guestId: 17,
   type: "payment",
   date: "2024-03-16T14:05:00",
   description: "Final settlement",
   details: "Outstanding balance paid",
   amount: -75000,
   balance: 0,
   status: "completed",
   user: "Sarah (Front Desk)",
   paymentMethod: "CARD",
 },
 {
   id: 20,
   guestId: 25,
   type: "cancellation",
   date: "2024-03-11T09:20:00",
   description: "Reservation cancelled",
   details: "Guest cancelled - Full refund processed",
   amount: 0,
   balance: 0,
   status: "cancelled",
   user: "Sarah (Front Desk)",
   reason: "Change of plans",
 },
 {
   id: 21,
   guestId: 26,
   type: "no_show",
   date: "2024-03-12T23:59:00",
   description: "No show",
   details: "Guest did not arrive - Charged 1 night",
   amount: 15000,
   balance: 15000,
   status: "pending",
   user: "System (Night Audit)",
   department: "ROOM",
   paymentMethod: "CHARGE",
 },
 {
   id: 22,
   guestId: 5,
   type: "organization",
   date: "2024-03-13T15:00:00",
   description: "Billed to organization",
   details: "Tech Corp - Account #INV-2024-123",
   amount: 50000,
   balance: 50000,
   status: "pending",
   user: "John (Front Desk)",
   organization: "Tech Corp",
   department: "ROOM",
 },
 {
   id: 23,
   guestId: 3,
   type: "deposit",
   date: "2024-03-14T11:00:00",
   description: "Security deposit",
   details: "Refundable deposit",
   amount: -20000,
   balance: -20000,
   status: "completed",
   user: "Sarah (Front Desk)",
   paymentMethod: "CARD",
 },
 {
   id: 24,
   guestId: 3,
   type: "refund",
   date: "2024-03-16T10:00:00",
   description: "Deposit refunded",
   details: "No damages - Full refund",
   amount: 20000,
   balance: 0,
   status: "completed",
   user: "John (Front Desk)",
   paymentMethod: "CARD_REFUND",
 },
 {
   id: 25,
   guestId: 9,
   type: "upgrade",
   date: "2024-03-15T13:00:00",
   description: "Room upgraded",
   details: "From Standard to Deluxe - No charge (VIP)",
   amount: 0,
   balance: 0,
   status: "completed",
   user: "Manager - Robert",
 },
 {
   id: 26,
   guestId: 19,
   type: "charge",
   subType: "extra_bed",
   date: "2024-03-14T16:00:00",
   description: "Extra bed",
   details: "Additional guest - Rollaway bed",
   amount: 2000,
   balance: 2000,
   status: "pending",
   user: "Housekeeping - Mary",
   department: "ROOM",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 27,
   guestId: 8,
   type: "charge",
   subType: "parking",
   date: "2024-03-15T08:30:00",
   description: "Valet parking",
   details: "2 nights",
   amount: 2000,
   balance: 2000,
   status: "pending",
   user: "Valet - James",
   department: "PARKING",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 28,
   guestId: 20,
   type: "charge",
   subType: "business",
   date: "2024-03-15T10:15:00",
   description: "Business center",
   details: "Printing & copying",
   amount: 500,
   balance: 500,
   status: "pending",
   user: "Business Center - Lisa",
   department: "BUSINESS",
   paymentMethod: "POST_TO_ROOM",
 },
 {
   id: 29,
   guestId: 18,
   type: "complimentary",
   date: "2024-03-16T19:00:00",
   description: "Complimentary dinner",
   details: "Guest satisfaction - Manager approval",
   amount: 0,
   balance: 0,
   status: "completed",
   user: "Manager - Robert",
   department: "F&B",
 },
 {
   id: 30,
   guestId: 11,
   type: "adjustment",
   date: "2024-03-17T20:30:00",
   description: "Rate adjustment",
   details: "Corporate rate applied - Refund difference",
   amount: -3000,
   balance: -3000,
   status: "completed",
   user: "John (Front Desk)",
   department: "ROOM",
 },
];
