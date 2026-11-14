/**
 * First names for students who enter from the social campus on (DESIGN.md 63): wider lists, each fitting a gender,
 * so a floor of thirty rarely has two of a name and a card or a story can say girlfriend or boyfriend. Students who
 * were already enrolled keep the names they had, from FIRST_NAMES in students.ts: nobody is ever renamed.
 *
 * First names only: surnames stay invented, so no card carries the full name of a real person. None is printed on
 * the reference map (tests/modelCampus.test.ts).
 */

export const WOMEN_NAMES: readonly string[] = [
  'Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Abigail', 'Emily', 'Madison', 'Elizabeth',
  'Chloe', 'Ella', 'Addison', 'Natalie', 'Lily', 'Grace', 'Hannah', 'Samantha', 'Anna', 'Sarah',
  'Alexis', 'Ashley', 'Brianna', 'Lauren', 'Jessica', 'Kayla', 'Victoria', 'Alyssa', 'Destiny', 'Jasmine',
  'Rachel', 'Megan', 'Haley', 'Katherine', 'Allison', 'Maria', 'Sydney', 'Gabriella', 'Nicole', 'Amanda',
  'Stephanie', 'Brooke', 'Mackenzie', 'Kaitlyn', 'Makayla', 'Julia', 'Savannah', 'Leah', 'Zoe', 'Aaliyah',
  'Mya', 'Trinity', 'Hailey', 'Jada', 'Kylie', 'Paige', 'Isabel', 'Amelia', 'Claire', 'Aubrey',
  'Bella', 'Layla', 'Mara', 'Lillian', 'Evelyn', 'Arianna', 'Gianna', 'Camila', 'Naomi', 'Valeria',
  'Lucy', 'Stella', 'Violet', 'Aurora', 'Hazel', 'Nora', 'Scarlett', 'Penelope', 'Eleanor', 'Elena',
  'Mila', 'Ruby', 'Alice', 'Iris', 'Jade', 'June', 'Rose', 'Ivy', 'Vivian', 'Daisy',
  'Willow', 'Luna', 'Nova', 'Tessa', 'Vera', 'Yasmin', 'Zara', 'Leila', 'Mira', 'Priya',
  'Ananya', 'Mei', 'Hana', 'Yuki', 'Sofia', 'Lucia', 'Ximena', 'Daniela', 'Mariana', 'Fatima',
  'Amira', 'Nadia', 'Imani', 'Zuri', 'Aisha', 'Tiana', 'Kiara', 'Bianca', 'Carmen', 'Rosa',
  'Elisa', 'Marisol', 'Paola', 'Andrea', 'Monica', 'Diana', 'Erica', 'Gloria', 'Irene', 'Laura',
  'Lena', 'Lydia', 'Molly', 'Nina', 'Olive', 'Piper', 'Quinley', 'Reagan', 'Selena', 'Talia',
  'Uma', 'Valentina', 'Whitney', 'Xiomara', 'Yara', 'Zelda', 'Adeline', 'Beatrice', 'Cecilia', 'Delilah',
  'Esme', 'Freya', 'Georgia', 'Harriet', 'Ingrid', 'Josephine', 'Kenzie', 'Lucille', 'Margot', 'Nadine',
  'Ophelia', 'Phoebe', 'Rhea', 'Sienna', 'Thea', 'Ursula', 'Wanda', 'Esther', 'Brielle', 'Celeste',
  'Dahlia', 'Elise', 'Fiona', 'Gemma', 'Heidi', 'Isla', 'Juliet', 'Kira', 'Lana', 'Maeve',
  'Noelle', 'Opal', 'Pearl', 'Raina', 'Sabrina', 'Tamara', 'Vanessa', 'Wynona', 'Yvette', 'Zoey',
  'Ariel', 'Bethany', 'Cora', 'Daphne', 'Eliza', 'Felicity', 'Ginger', 'Holly', 'Jolene', 'Kendra',
];

export const MEN_NAMES: readonly string[] = [
  'Liam', 'Noah', 'Ethan', 'Mason', 'Logan', 'Lucas', 'Jacob', 'Aiden', 'Jackson', 'Elijah',
  'Michael', 'Daniel', 'Matthew', 'Joseph', 'David', 'James', 'Benjamin', 'Alexander', 'William', 'Andrew',
  'Joshua', 'Christopher', 'Anthony', 'Ryan', 'Nathan', 'Tyler', 'Brandon', 'Dylan', 'Justin', 'Kevin',
  'Brian', 'Jason', 'Eric', 'Adam', 'Austin', 'Caleb', 'Isaac', 'Gabriel', 'Samuel', 'Owen',
  'Wyatt', 'Jack', 'Luke', 'Henry', 'Levi', 'Sebastian', 'Mateo', 'Diego', 'Carlos', 'Luis',
  'Miguel', 'Javier', 'Andres', 'Rafael', 'Marco', 'Leo', 'Theo', 'Felix', 'Oscar', 'Hugo',
  'Omar', 'Yusuf', 'Ibrahim', 'Malik', 'Jamal', 'Darius', 'Andre', 'Marcus', 'Terrence', 'Isaiah',
  'Jalen', 'Xavier', 'Dominic', 'Vincent', 'Victor', 'Julian', 'Adrian', 'Evan', 'Connor', 'Cole',
  'Grant', 'Chase', 'Carter', 'Hunter', 'Cooper', 'Bryce', 'Trevor', 'Spencer', 'Garrett', 'Colin',
  'Shane', 'Derek', 'Kyle', 'Sean', 'Patrick', 'Thomas', 'Nicholas', 'Zachary', 'Jonathan', 'Aaron',
  'Jeremiah', 'Josiah', 'Ezra', 'Asher', 'Silas', 'Miles', 'Jasper', 'Rhys', 'Declan', 'Finn',
  'Tristan', 'Damian', 'Elias', 'Emmett', 'Everett', 'Graham', 'Harrison', 'Ian', 'Jude', 'Kieran',
  'Landon', 'Mitchell', 'Nolan', 'Preston', 'Quentin', 'Reid', 'Ronan', 'Simon', 'Tobias', 'Wesley',
  'Zane', 'Arjun', 'Rohan', 'Vikram', 'Kenji', 'Hiroshi', 'Minh', 'Tuan', 'Jin', 'Wei',
  'Kofi', 'Kwame', 'Tariq', 'Hassan', 'Amir', 'Karim', 'Santiago', 'Emilio', 'Joaquin', 'Tomas',
  'Bruno', 'Felipe', 'Gustavo', 'Ricardo', 'Ramon', 'Pedro', 'Alonso', 'Beckett', 'Callum', 'Dante',
  'Eli', 'Fletcher', 'Gideon', 'Hector', 'Ivan', 'Jonah', 'Kaden', 'Lorenzo', 'Mathis', 'Nathaniel',
  'Otto', 'Pablo', 'Rocco', 'Soren', 'Tate', 'Uriel', 'Vaughn', 'Wade', 'Xander', 'Yosef',
  'Zeke', 'Abel', 'Boris', 'Cyrus', 'Desmond', 'Enzo', 'Franco', 'Gavin', 'Holden', 'Idris',
  'Jett', 'Knox', 'Lionel', 'Marcel', 'Nash', 'Orion', 'Ravi', 'Sergio', 'Thiago', 'Ulysses',
];

/** For nonbinary students: the old list, which fits anyone, and a few more. */
export const NEUTRAL_EXTRA: readonly string[] = ['Taylor', 'Drew', 'Jesse', 'Emery', 'Rory', 'Peyton', 'Cameron', 'Elliot', 'Hollis', 'Briar'];
