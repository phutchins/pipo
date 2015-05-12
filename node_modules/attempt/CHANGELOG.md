# Attempt
Retries functions that throw or call back with an error, in crazily
customizable ways.

##ChangeLog

### v1.0.1
- Attempt no longer swallows errors in the callback func (nebulade)

### v1.0.0
- Options and tryFunc are now accepted in any order.
- Default retries is now 2 instead of 5.  If you fail 3 times in a row, you'll probably fail 3 more.
- More consistent formatting around examples.
- Docs are clearer; exception handling is called out in JSDoc.
- Attempt is now considered 1.0.0 stable.

### v0.2.0
- Added 'max' option to cap increasing interval times. (dominictarr)
- Added 'random' option to randomly fluctuate interval times. (dominictarr)

### v0.1.0
- **Initial Release**